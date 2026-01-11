// commands/Management/editembed.js
import {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} from "discord.js";

const OWNER_ID = "238058962711216130";
const MANAGER_ROLE_ID = "1332197345403605123"; // CoC role
const GUILD_LOG_CHANNEL = "1388886528968622080"; // mod log channel

function safeLower(x) {
  return String(x ?? "").toLowerCase();
}

export default {
  data: new SlashCommandBuilder()
    .setName("editembed")
    .setDescription("Edit a stored embed section (rules, coc, information).")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((opt) =>
      opt
        .setName("embed")
        .setDescription("Which embed category to edit?")
        .setRequired(true)
        .addChoices(
          { name: "Rules (/rules)", value: "rules" },
          { name: "Chain of Command (/coc)", value: "coc" },
          { name: "Information (/information)", value: "information" },
        ),
    )
    .addIntegerOption((opt) =>
      opt.setName("section").setDescription("Which section number to edit?").setRequired(true),
    )
    .addStringOption((opt) =>
      opt
        .setName("field")
        .setDescription("Which field of the embed to edit?")
        .setRequired(true)
        .addChoices(
          { name: "Title", value: "title" },
          { name: "Description", value: "description" },
          { name: "Footer", value: "footer" },
        ),
    ),

  async execute(interaction, client) {
    // 🚫 DO NOT deferReply here — you cannot showModal after replying/defer
    const db = client.db;
    if (!db) {
      return interaction.reply({ content: "❌ Database not available.", flags: 64 });
    }

    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    const isOwner = interaction.user.id === OWNER_ID;
    const hasManagerRole = member?.roles?.cache?.has(MANAGER_ROLE_ID);

    if (!isOwner && !hasManagerRole) {
      return interaction.reply({ content: "🚫 You are not allowed to edit embeds.", flags: 64 });
    }

    const category = interaction.options.getString("embed");
    const section = interaction.options.getInteger("section");
    const field = interaction.options.getString("field");

    // Pull ALL sections for that category (so we can show real "Available:" list)
    const [sections] = await db.query(
      "SELECT section_number, title, description, footer FROM embed_sections WHERE category = ? ORDER BY section_number ASC",
      [category],
    );

    const entry = sections.find((s) => Number(s.section_number) === Number(section));

    if (!entry) {
      const available = sections
        .map((s) => `${s.section_number}${s.title ? ` (${s.title})` : ""}`)
        .join(", ");

      return interaction.reply({
        content: `❌ No section **${section}** found for **${category}**.\nAvailable: ${available || "None"}`,
        flags: 64,
      });
    }

    const currentValue =
      field === "title"
        ? entry.title ?? ""
        : field === "footer"
          ? entry.footer ?? ""
          : entry.description ?? "";

    // ✅ modal customId MUST match your index.js handler:
    // startsWith("editembed_modal:")
    const modal = new ModalBuilder()
      .setCustomId(`editembed_modal:${category}:${section}:${field}`)
      .setTitle(`Edit ${category} • Section ${section}`);

    const input = new TextInputBuilder()
      .setCustomId("new_value")
      .setLabel(`Editing: ${field}`)
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setValue(String(currentValue).slice(0, 4000)); // Discord max

    modal.addComponents(new ActionRowBuilder().addComponents(input));

    // Log "initiated" (optional but you wanted logging)
    const guildLog = interaction.guild.channels.cache.get(GUILD_LOG_CHANNEL);
    const devLog = await client.channels.fetch(process.env.DEV_LOG_CHANNEL_ID).catch(() => null);

    const logEmbed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle("✏️ Embed Edit Initiated")
      .addFields(
        { name: "User", value: `${interaction.user.tag} (${interaction.user.id})` },
        { name: "Category", value: category },
        { name: "Section", value: String(section) },
        { name: "Field", value: field },
      )
      .setTimestamp();

    if (guildLog) guildLog.send({ embeds: [logEmbed] }).catch(() => null);
    if (devLog) devLog.send({ embeds: [logEmbed] }).catch(() => null);

    // ✅ show modal
    return interaction.showModal(modal);
  },
};

// ✅ Modal submit handler used by index.js
export async function handleEditEmbedModal(interaction, client) {
  const db = client.db;
  if (!db) {
    return interaction.reply({ content: "❌ Database not available.", flags: 64 }).catch(() => null);
  }

  // customId: editembed_modal:<category>:<section>:<field>
  const parts = interaction.customId.split(":");
  // [ "editembed_modal", category, section, field ]
  const category = parts[1];
  const section = Number(parts[2]);
  const field = parts[3];

  const newValue = interaction.fields.getTextInputValue("new_value") ?? "";

  const allowedFields = new Set(["title", "description", "footer"]);
  if (!allowedFields.has(field)) {
    return interaction.reply({ content: "❌ Invalid field.", flags: 64 }).catch(() => null);
  }

  // Update row
  const sql = `UPDATE embed_sections SET ${field} = ? WHERE category = ? AND section_number = ? LIMIT 1`;
  const [result] = await db.query(sql, [newValue, category, section]);

  if (!result?.affectedRows) {
    return interaction
      .reply({
        content: `❌ Update failed. No row matched category=${category}, section=${section}.`,
        flags: 64,
      })
      .catch(() => null);
  }

  // Confirm
  return interaction
    .reply({
      content: `✅ Updated **${category}** section **${section}** (${field}).`,
      flags: 64,
    })
    .catch(() => null);
}
