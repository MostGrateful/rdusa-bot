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
const THREAD_ROLE = "1347706993204264991";

const ALLOWED_ROLES = [
  "1332197345403605123",
  "1369877362224664647",
  "1369065942243344464",
  "1370531377468149881",
  "1386575843488170075",
  "1370529017307988120",
  "1369066592423645244",
];

export default {
  data: new SlashCommandBuilder()
    .setName("qotd")
    .setDescription("Create a Question of the Day with preview"),

  async execute(interaction, client) {
    const member = await interaction.guild.members.fetch(interaction.user.id);

    if (!member.roles.cache.some(r => ALLOWED_ROLES.includes(r.id))) {
      return interaction.reply({ content: "🚫 You cannot use this command.", flags: 64 });
    }

    // Show modal
    const modal = new ModalBuilder()
      .setCustomId("qotd_modal")
      .setTitle("Create QOTD");

    const qInput = new TextInputBuilder()
      .setCustomId("qotd_question")
      .setLabel("Enter your Question of the Day")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(qInput));

    await interaction.showModal(modal);
  },
};

// ─────────────────────────────────────────────
// 📌 Modal Submit Handler
// ─────────────────────────────────────────────
export async function handleQOTDModal(interaction, client) {
  if (interaction.customId !== "qotd_modal") return;

  const db = client.db;
  const question = interaction.fields.getTextInputValue("qotd_question");
  const user = interaction.user;

  await interaction.deferReply({ flags: 64 });

  // Fetch SQL values
  const [rows] = await db.query("SELECT qotd_counter, last_qotd_time FROM bot_config WHERE id = 1");
  const counter = rows[0].qotd_counter;
  const lastTime = rows[0].last_qotd_time;

  // Cooldown check: 24 hours
  const now = Date.now();
  if (now - lastTime < 86400000) {
    const hrsLeft = ((86400000 - (now - lastTime)) / 3600000).toFixed(1);
    return interaction.editReply(`🕒 QOTD can be posted again in **${hrsLeft} hours**.`);
  }

  // Build preview embed
  const previewEmbed = new EmbedBuilder()
    .setColor(0x2596be)
    .setTitle(`QOTD #${counter + 1} — Preview`)
    .setDescription(question)
    .setFooter({ text: `Requested by ${user.tag}` })
    .setTimestamp();

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("qotd_submit").setLabel("Submit").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("qotd_edit").setLabel("Edit").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("qotd_cancel").setLabel("Cancel").setStyle(ButtonStyle.Danger),
  );

  // Store in memory for this interaction
  client.qotdDraft = { question };

  await interaction.editReply({ embeds: [previewEmbed], components: [buttons] });
}

// ─────────────────────────────────────────────
// 📌 Button Handler
// ─────────────────────────────────────────────
export async function handleQOTDButtons(interaction, client) {
  if (!["qotd_submit", "qotd_edit", "qotd_cancel"].includes(interaction.customId)) return;

  const db = client.db;
  const draft = client.qotdDraft;
  if (!draft) return interaction.reply({ content: "❌ No draft found.", flags: 64 });

  if (interaction.customId === "qotd_cancel") {
    client.qotdDraft = null;
    return interaction.reply({ content: "❌ QOTD creation cancelled.", flags: 64 });
  }

  if (interaction.customId === "qotd_edit") {
    const modal = new ModalBuilder().setCustomId("qotd_modal").setTitle("Edit QOTD");
    const qInput = new TextInputBuilder()
      .setCustomId("qotd_question")
      .setLabel("Edit Question")
      .setStyle(TextInputStyle.Paragraph)
      .setValue(draft.question);

    modal.addComponents(new ActionRowBuilder().addComponents(qInput));
    return interaction.showModal(modal);
  }

  if (interaction.customId === "qotd_submit") {
    await interaction.deferReply({ flags: 64 });

    // Get SQL counter
    const [rows] = await db.query("SELECT qotd_counter FROM bot_config WHERE id = 1");
    const newCounter = rows[0].qotd_counter + 1;

    // Update SQL
    await db.query("UPDATE bot_config SET qotd_counter = ?, last_qotd_time = ? WHERE id = 1", [
      newCounter,
      Date.now(),
    ]);

    const qotdEmbed = new EmbedBuilder()
      .setColor(0x2596be)
      .setTitle(`QOTD #${newCounter}`)
      .setDescription(draft.question)
      .setFooter({ text: `Sent by ${interaction.user.tag}` })
      .setTimestamp();

    const channel = await client.channels.fetch(QOTD_CHANNEL);
    const msg = await channel.send({ content: `<@&${PING_ROLE}>`, embeds: [qotdEmbed] });

    // Thread
    const thread = await msg.startThread({
      name: `AOTD - ${draft.question.substring(0, 40)}`,
      autoArchiveDuration: 1440,
    });

    await thread.send(`💬 Discuss the QOTD here! Only <@&${THREAD_ROLE}> can chat.`);

    client.qotdDraft = null;

    return interaction.editReply("✅ QOTD posted successfully!");
  }
}
