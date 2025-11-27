// commands/Management/editembed.js
import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} from "discord.js";
import { getEmbedSection, updateEmbedSection } from "../../utils/embedStore.js";

const OWNER_ID = "238058962711216130"; // you
const EDITOR_ROLE_ID = "1332197345403605123"; // role allowed to edit

export default {
  data: new SlashCommandBuilder()
    .setName("editembed")
    .setDescription("Edit a section of /coc, /rules, or /information.")
    .addStringOption((opt) =>
      opt
        .setName("embed")
        .setDescription("Which embed would you like to edit?")
        .setRequired(true)
        .addChoices(
          { name: "Chain of Command (/coc)", value: "coc" },
          { name: "Rules (/rules)", value: "rules" },
          { name: "Information (/information)", value: "information" },
        )
    )
    .addIntegerOption((opt) =>
      opt
        .setName("section")
        .setDescription("Which section number?")
        .setRequired(true)
        .setMinValue(1)
    )
    .addStringOption((opt) =>
      opt
        .setName("field")
        .setDescription("What do you want to edit?")
        .setRequired(true)
        .addChoices(
          { name: "Title", value: "title" },
          { name: "Description", value: "description" },
          { name: "Color (hex)", value: "color" },
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction, client) {
    const db = client.db;

    // 🔐 Permission check: owner OR has editor role
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const isOwner = interaction.user.id === OWNER_ID;
    const hasEditorRole = member.roles.cache.has(EDITOR_ROLE_ID);

    if (!isOwner && !hasEditorRole) {
      return interaction.reply({
        content: "🚫 You are not allowed to edit these embeds.",
        flags: 64,
      });
    }

    const embedKey = interaction.options.getString("embed");
    const sectionIndex = interaction.options.getInteger("section");
    const field = interaction.options.getString("field");

    // Make sure the section exists
    const section = await getEmbedSection(db, embedKey, sectionIndex);
    if (!section) {
      return interaction.reply({
        content: `❌ No section **${sectionIndex}** found for \`${embedKey}\`. Make sure you've inserted it into the database.`,
        flags: 64,
      });
    }

    // Build a modal so they can type the new value
    const modal = new ModalBuilder()
      .setCustomId(`editembed:${embedKey}:${sectionIndex}:${field}`)
      .setTitle(`Edit ${embedKey} • Section ${sectionIndex} • ${field}`);

    let label = "New value";
    let placeholder = "";
    let value = "";

    if (field === "title") {
      label = "New title";
      value = section.title || "";
      placeholder = "Section 1, Rules, etc.";
    } else if (field === "description") {
      label = "New description";
      value = section.description || "";
      placeholder = "Markdown text for this section.";
    } else if (field === "color") {
      label = "New color (hex)";
      const currentColor =
        typeof section.color === "number"
          ? `#${section.color.toString(16).padStart(6, "0")}`
          : "#ffffff";
      value = currentColor;
      placeholder = "#2b2d31";
    }

    const input = new TextInputBuilder()
      .setCustomId("editembed_value")
      .setLabel(label)
      .setStyle(field === "description" ? TextInputStyle.Paragraph : TextInputStyle.Short)
      .setRequired(true)
      .setPlaceholder(placeholder);

    // Only set .setValue if it's not insanely long
    if (value.length > 0 && value.length <= 4000) {
      input.setValue(value);
    }

    const row = new ActionRowBuilder().addComponents(input);
    modal.addComponents(row);

    // Show the modal (no reply yet)
    await interaction.showModal(modal);
  },
};

/**
 * Handle modal submissions for /editembed
 * @param {import("discord.js").ModalSubmitInteraction} interaction
 * @param {import("discord.js").Client} client
 */
export async function handleEditEmbedModal(interaction, client) {
  const db = client.db;

  if (!interaction.customId.startsWith("editembed:")) return;

  const [, embedKey, sectionIndexStr, field] = interaction.customId.split(":");
  const sectionIndex = parseInt(sectionIndexStr, 10);

  const newValue = interaction.fields.getTextInputValue("editembed_value");

  await interaction.deferReply({ flags: 64 });

  try {
    const section = await getEmbedSection(db, embedKey, sectionIndex);
    if (!section) {
      return interaction.editReply(
        `❌ Section **${sectionIndex}** for \`${embedKey}\` no longer exists.`
      );
    }

    const updates = {};

    if (field === "title") {
      updates.title = newValue;
    } else if (field === "description") {
      updates.description = newValue;
    } else if (field === "color") {
      // Accept #RRGGBB or RRGGBB
      const cleaned = newValue.trim().replace("#", "");
      const colorInt = parseInt(cleaned, 16);

      if (Number.isNaN(colorInt) || cleaned.length !== 6) {
        return interaction.editReply(
          "❌ Invalid color format. Please use a 6-digit hex like `#2b2d31`."
        );
      }

      updates.color = colorInt;
    } else {
      return interaction.editReply("❌ Unknown field.");
    }

    await updateEmbedSection(db, embedKey, sectionIndex, updates);

    let prettyField = field.charAt(0).toUpperCase() + field.slice(1);
    await interaction.editReply(
      `✅ Updated **${prettyField}** for \`${embedKey}\` section **${sectionIndex}**.`
    );
  } catch (err) {
    console.error("❌ Error in handleEditEmbedModal:", err);
    await interaction.editReply("❌ Failed to update the embed section. Check console for details.");
  }
}
