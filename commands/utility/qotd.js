import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";

const QOTD_CHANNEL = "1389009644063690975";
const PING_ROLE = "1375628530548998154";

const ALLOWED_ROLES = [
  "1332197345403605123",
  "1369877362224664647",
  "1369065942243344464",
  "1370531377468149881",
  "1386575843488170075",
  "1370529017307988120",
  "1369066592423645244",
];

function hasAllowedRole(member) {
  return member?.roles?.cache?.some((r) => ALLOWED_ROLES.includes(r.id));
}

async function ensureQotdDraftTable(db) {
  // Safe to run repeatedly
  await db.query(`
    CREATE TABLE IF NOT EXISTS qotd_drafts (
      message_id VARCHAR(32) PRIMARY KEY,
      guild_id VARCHAR(32) NOT NULL,
      channel_id VARCHAR(32) NOT NULL,
      author_id VARCHAR(32) NOT NULL,
      question TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

function buildPreviewEmbed(counterNext, question, userTag) {
  return new EmbedBuilder()
    .setColor(0x2596be)
    .setTitle(`QOTD #${counterNext} — Preview`)
    .setDescription(question)
    .setFooter({ text: `Requested by ${userTag}` })
    .setTimestamp();
}

function buildPreviewButtons(messageId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`qotd_submit:${messageId}`)
      .setLabel("Submit")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`qotd_edit:${messageId}`)
      .setLabel("Edit")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`qotd_cancel:${messageId}`)
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Danger),
  );
}

export default {
  data: new SlashCommandBuilder()
    .setName("qotd")
    .setDescription("Create a Question of the Day with preview"),

  async execute(interaction, client) {
    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    if (!hasAllowedRole(member)) {
      return interaction.reply({ content: "🚫 You cannot use this command.", flags: 64 });
    }

    // IMPORTANT: do NOT deferReply before showModal
    const modal = new ModalBuilder()
      .setCustomId("qotd_create_modal")
      .setTitle("Create QOTD");

    const qInput = new TextInputBuilder()
      .setCustomId("qotd_question")
      .setLabel("Enter your Question of the Day")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(qInput));
    return interaction.showModal(modal);
  },
};

// ─────────────────────────────────────────────
// 📌 Modal Submit Handler
// Handles BOTH create and edit modals
// ─────────────────────────────────────────────
export async function handleQOTDModal(interaction, client) {
  const db = client.db;
  if (!db) return interaction.reply({ content: "❌ Database not available.", flags: 64 }).catch(() => null);

  // Create: qotd_create_modal
  // Edit:   qotd_edit_modal:<messageId>
  const isCreate = interaction.customId === "qotd_create_modal";
  const isEdit = interaction.customId.startsWith("qotd_edit_modal:");

  if (!isCreate && !isEdit) return;

  await ensureQotdDraftTable(db);

  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!hasAllowedRole(member)) {
    return interaction.reply({ content: "🚫 You cannot use this.", flags: 64 }).catch(() => null);
  }

  const question = interaction.fields.getTextInputValue("qotd_question")?.trim();
  if (!question) {
    return interaction.reply({ content: "❌ Question cannot be empty.", flags: 64 }).catch(() => null);
  }

  await interaction.deferReply({ flags: 64 });

  // Cooldown + counter (expects bot_config row id=1)
  const [rows] = await db.query("SELECT qotd_counter, last_qotd_time FROM bot_config WHERE id = 1");
  const counter = Number(rows?.[0]?.qotd_counter ?? 0);
  const lastTime = Number(rows?.[0]?.last_qotd_time ?? 0);

  const now = Date.now();
  const cooldownMs = 86_400_000;

  if (now - lastTime < cooldownMs) {
    const hrsLeft = ((cooldownMs - (now - lastTime)) / 3_600_000).toFixed(1);
    return interaction.editReply(`🕒 QOTD can be posted again in **${hrsLeft} hours**.`);
  }

  // If editing, update existing draft row + edit preview message embed
  if (isEdit) {
    const messageId = interaction.customId.split(":")[1];

    const [draftRows] = await db.query(
      "SELECT * FROM qotd_drafts WHERE message_id=? LIMIT 1",
      [messageId],
    );

    if (!draftRows.length) {
      return interaction.editReply("❌ Draft not found (maybe it was already submitted/cancelled).");
    }

    const draft = draftRows[0];
    if (draft.author_id !== interaction.user.id) {
      return interaction.editReply("🚫 Only the original creator can edit this draft.");
    }

    await db.query("UPDATE qotd_drafts SET question=? WHERE message_id=?", [question, messageId]);

    const previewEmbed = buildPreviewEmbed(counter + 1, question, interaction.user.tag);
    const ch = await client.channels.fetch(draft.channel_id).catch(() => null);
    const msg = ch ? await ch.messages.fetch(messageId).catch(() => null) : null;

    if (msg) {
      await msg.edit({ embeds: [previewEmbed], components: [buildPreviewButtons(messageId)] }).catch(() => null);
    }

    return interaction.editReply("✅ Draft updated.");
  }

  // Create flow:
  const previewEmbed = buildPreviewEmbed(counter + 1, question, interaction.user.tag);

  // Send ephemeral preview to the command user (with buttons)
  // We need a real message id to key the draft -> send first, then edit with proper customIds
  const sent = await interaction.editReply({
    embeds: [previewEmbed],
    components: [buildPreviewButtons("PENDING")],
  });

  // `editReply` returns the message in discord.js v14
  const messageId = sent.id;

  // Patch buttons with the real message id
  await interaction.editReply({
    embeds: [previewEmbed],
    components: [buildPreviewButtons(messageId)],
  });

  // Save draft in DB so it survives restarts
  await db.query(
    `INSERT INTO qotd_drafts (message_id, guild_id, channel_id, author_id, question)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE question=VALUES(question)`,
    [messageId, interaction.guild.id, interaction.channel.id, interaction.user.id, question],
  );
}

// ─────────────────────────────────────────────
// 📌 Button Handler (persistent + restart safe)
// ─────────────────────────────────────────────
export async function handleQOTDButtons(interaction, client) {
  if (!interaction.isButton()) return;
  if (!interaction.customId.startsWith("qotd_")) return;

  const db = client.db;
  if (!db) return interaction.reply({ content: "❌ Database not available.", flags: 64 }).catch(() => null);

  await ensureQotdDraftTable(db);

  const [action, messageId] = interaction.customId.split(":");
  if (!messageId) return interaction.reply({ content: "❌ Invalid button payload.", flags: 64 }).catch(() => null);

  // Must be allowed role
  const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
  if (!hasAllowedRole(member)) {
    return interaction.reply({ content: "🚫 You cannot use these buttons.", flags: 64 }).catch(() => null);
  }

  // Load draft from DB
  const [draftRows] = await db.query("SELECT * FROM qotd_drafts WHERE message_id=? LIMIT 1", [messageId]);
  if (!draftRows.length) {
    // If draft is gone, just remove buttons quietly
    await interaction.deferUpdate().catch(() => null);
    await interaction.message.edit({ components: [] }).catch(() => null);
    return;
  }

  const draft = draftRows[0];

  // Only original author can edit/cancel/submit (prevents others hijacking)
  if (draft.author_id !== interaction.user.id) {
    return interaction.reply({ content: "🚫 Only the creator can manage this draft.", flags: 64 }).catch(() => null);
  }

  // CANCEL
  if (action === "qotd_cancel") {
    await interaction.deferUpdate().catch(() => null);
    await db.query("DELETE FROM qotd_drafts WHERE message_id=?", [messageId]);
    await interaction.message.edit({ content: "❌ QOTD creation cancelled.", embeds: [], components: [] }).catch(() => null);
    return;
  }

  // EDIT -> open modal (no defer before showModal)
  if (action === "qotd_edit") {
    const modal = new ModalBuilder()
      .setCustomId(`qotd_edit_modal:${messageId}`)
      .setTitle("Edit QOTD");

    const qInput = new TextInputBuilder()
      .setCustomId("qotd_question")
      .setLabel("Edit Question")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setValue(draft.question);

    modal.addComponents(new ActionRowBuilder().addComponents(qInput));
    return interaction.showModal(modal).catch(() => null);
  }

  // SUBMIT
  if (action === "qotd_submit") {
    await interaction.deferUpdate().catch(() => null);

    // Re-check cooldown/counter
    const [rows] = await db.query("SELECT qotd_counter, last_qotd_time FROM bot_config WHERE id = 1");
    const counter = Number(rows?.[0]?.qotd_counter ?? 0);
    const lastTime = Number(rows?.[0]?.last_qotd_time ?? 0);

    const now = Date.now();
    const cooldownMs = 86_400_000;
    if (now - lastTime < cooldownMs) {
      const hrsLeft = ((cooldownMs - (now - lastTime)) / 3_600_000).toFixed(1);
      return interaction.followUp({ content: `🕒 QOTD can be posted again in **${hrsLeft} hours**.`, flags: 64 }).catch(() => null);
    }

    const newCounter = counter + 1;

    // Update DB counter + time
    await db.query("UPDATE bot_config SET qotd_counter=?, last_qotd_time=? WHERE id=1", [newCounter, now]);

    // Post in QOTD channel
    const channel = await client.channels.fetch(QOTD_CHANNEL).catch(() => null);
    if (!channel) {
      return interaction.followUp({ content: "❌ QOTD channel not found.", flags: 64 }).catch(() => null);
    }

    const qotdEmbed = new EmbedBuilder()
      .setColor(0x2596be)
      .setTitle(`QOTD #${newCounter}`)
      .setDescription(draft.question)
      .setFooter({ text: `Sent by ${interaction.user.tag}` })
      .setTimestamp();

    const msg = await channel.send({ content: `<@&${PING_ROLE}>`, embeds: [qotdEmbed] });

    // Optional: thread
    await msg
      .startThread({
        name: `AOTD - ${draft.question.substring(0, 40)}`,
        autoArchiveDuration: 1440,
      })
      .then((thread) => thread.send("💬 Discuss the QOTD here!"))
      .catch(() => null);

    // Remove draft + disable preview buttons
    await db.query("DELETE FROM qotd_drafts WHERE message_id=?", [messageId]);
    await interaction.message.edit({ components: [] }).catch(() => null);

    return interaction.followUp({ content: "✅ QOTD posted successfully!", flags: 64 }).catch(() => null);
  }
}
