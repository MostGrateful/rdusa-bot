import {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder,
} from "discord.js";
import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

const { TRELLO_API_KEY, TRELLO_TOKEN } = process.env;

export default {
  data: new SlashCommandBuilder()
    .setName("suggest")
    .setDescription("Submit a new suggestion for the RDUSA development team."),

  async execute(interaction) {
    const modal = new ModalBuilder()
      .setCustomId("suggest_modal")
      .setTitle("Submit a Suggestion");

    // ✅ Removed username field — bot will fill automatically

    const suggestionInput = new TextInputBuilder()
      .setCustomId("suggest_text")
      .setLabel("Suggestion Title")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("Short title for your suggestion")
      .setRequired(true);

    const reasonInput = new TextInputBuilder()
      .setCustomId("suggest_reason")
      .setLabel("Why should we approve this?")
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder("Explain the reason behind your suggestion")
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(suggestionInput),
      new ActionRowBuilder().addComponents(reasonInput),
    );

    await interaction.showModal(modal);
  },
};

// ───────────────────────────────
// 📩 Modal Handler
// ───────────────────────────────
export async function handleSuggestModal(interaction) {
  if (interaction.customId !== "suggest_modal") return;

  await interaction.deferReply({ flags: 64 }).catch(() => null);

  // ✅ Auto-fill username: Discord tag (and ID is logged separately)
  const username = interaction.user.tag;

  const suggestion = interaction.fields.getTextInputValue("suggest_text");
  const reason = interaction.fields.getTextInputValue("suggest_reason");

  try {
    // REAL Board ID (not short link)
    const boardId = "690ae673bb97a288586916f8";

    // Get lists
    const listsRes = await fetch(
      `https://api.trello.com/1/boards/${boardId}/lists?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`,
    );
    const lists = await listsRes.json();

    const targetList = lists.find((l) => l.name?.toLowerCase() === "new suggestions");

    if (!targetList) {
      return interaction
        .editReply("❌ Could not find the **New Suggestions** list on Trello.")
        .catch(() => null);
    }

    // Get "Awaiting Review" label
    const labelsRes = await fetch(
      `https://api.trello.com/1/boards/${boardId}/labels?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`,
    );
    const labels = await labelsRes.json();

    const awaitingLabel = labels.find((l) => l.name?.toLowerCase() === "awaiting review");

    // Clean suggestion title (Trello max name length = 163)
    let cardTitle = suggestion.trim();
    if (cardTitle.length > 160) cardTitle = cardTitle.slice(0, 157) + "...";

    const desc = [
      `**Username:** ${username}`,
      `**Discord ID:** ${interaction.user.id}`,
      `**Suggestion:** ${suggestion}`,
      `**Reason:**`,
      `${reason}`,
    ].join("\n");

    // Create the Trello card
    const cardBody = {
      idList: targetList.id,
      name: cardTitle,
      desc,
      idLabels: awaitingLabel ? [awaitingLabel.id] : [],
    };

    const cardRes = await fetch(
      `https://api.trello.com/1/cards?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cardBody),
      },
    );

    if (!cardRes.ok) {
      const errTxt = await cardRes.text().catch(() => "");
      throw new Error(`Trello Error: ${errTxt}`);
    }

    const card = await cardRes.json();

    // Confirmation embed
    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle("💡 Suggestion Submitted")
      .setDescription(
        `Your suggestion has been submitted successfully.\n\n**Card:** [${cardTitle}](${card.url})`,
      )
      .addFields(
        {
          name: "Suggestion",
          value: suggestion.length > 1024 ? `${suggestion.slice(0, 1021)}...` : suggestion,
        },
        {
          name: "Reason",
          value: reason.length > 1024 ? `${reason.slice(0, 1021)}...` : reason,
        },
      )
      .setFooter({ text: "Status: Awaiting Review" })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] }).catch(() => null);
  } catch (err) {
    console.error("❌ Error submitting suggestion:", err);
    await interaction
      .editReply({
        content: "❌ There was an error submitting your suggestion to Trello.",
      })
      .catch(() => null);
  }
}
