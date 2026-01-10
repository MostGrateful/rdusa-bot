// commands/utility/editembed.js
import {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} from "discord.js";

import { getEmbedSections } from "../../utils/embedStore.js";

const OWNER_ID = "238058962711216130";
const MANAGER_ROLE_ID = "1332197345403605123"; // CoC role
const GUILD_LOG_CHANNEL = "1388886528968622080"; // mod log channel

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
      opt
        .setName("section")
        .setDescription("Which section number to edit?")
        .setRequired(true),
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

  /**
   * @param {import("discord.js").ChatInputCommandInteraction} interaction
   * @param {import("discord.js").Client} client
   */
  async execute(interaction, client) {
    const db = client.db;
    if (!db) {
      return interaction.reply({
        content: "❌ Database not available.",
        flags: 64,
      });
    }

    // ✅ Permission check
    const member =
      interaction.member ??
      (interaction.guild
        ? await interaction.guild.members.fetch(interaction.user.id).catch(() => null)
        : null);

    const isOwner = interaction.user.id === OWNER_ID;
    const hasManagerRole = member?.roles?.cache?.has(MANAGER_ROLE_ID) ?? false;

    if (!isOwner && !hasManagerRole) {
      return interaction.reply({
        content: "🚫 You are not allowed to edit embeds.",
        flags: 64,
      });
    }

    const category = interaction.options.getString("embed");
    const section = interaction.options.getInteger("section");
    const field = interaction.options.getString("field");

    // ✅ Validate section exists
    const sections = await getEmbedSections(db, category);
    const entry = sections.find((s) => Number(s.section_number) === Number(section));

    if (!entry) {
      return interaction.reply({
        content: `❌ No section **${section}** found for **${category}**.`,
        flags: 64,
      });
    }

    const currentValue =
      field === "title" ? entry.title : field === "footer" ? entry.footer : entry.description;

    // ✅ Build modal
    const modal = new ModalBuilder()
      .setCustomId(`editembed:${category}:${section}:${field}`)
      .setTitle(`Edit ${category} • Section ${section}`);

    const input = new TextInputBuilder()
      .setCustomId("new_value")
      .setLabel(`New ${field}`)
      .setStyle(field === "title" || field === "footer" ? TextInputStyle.Short : TextInputStyle.Paragraph)
      .setRequired(true)
      .setValue((currentValue ?? "").slice(0, 4000)); // Discord limits safety

    modal.addComponents(new ActionRowBuilder().addComponents(input));

    // ✅ IMPORTANT: showModal must be FIRST response (no defer/reply before this)
    await interaction.showModal(modal);

    // ✅ Logging: initiated (after showing modal)
    const guildLog = interaction.guild?.channels?.cache?.get(GUILD_LOG_CHANNEL) ?? null;
    const devLog = await client.channels.fetch(process.env.DEV_LOG_CHANNEL_ID).catch(() => null);

    const logEmbed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle("✏️ Embed Edit Initiated")
      .addFields(
        { name: "User", value: `${interaction.user.tag} (${interaction.user.id})` },
        { name: "Category", value: category },
        { name: "Section", value: String(section), inline: true },
        { name: "Field", value: field, inline: true },
      )
      .setTimestamp();

    if (guildLog) guildLog.send({ embeds: [logEmbed] }).catch(() => null);
    if (devLog) devLog.send({ embeds: [logEmbed] }).catch(() => null);
  },
};
