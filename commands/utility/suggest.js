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
    // ───────────────────────────────
    // 💡 Create Suggestion Modal
    // ───────────────────────────────
    const modal = new ModalBuilder()
      .setCustomId("suggest_modal")
      .setTitle("Submit a Suggestion");

    const usernameInput = new TextInputBuilder()
      .setCustomId("suggest_username")
      .setLabel("Username")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("Enter your Roblox or Discord username")
      .setRequired(true);

    const suggestionInput = new TextInputBuilder()
      .setCustomId("suggest_text")
      .setLabel("Suggestion")
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder("Describe your suggestion in detail")
      .setRequired(true);

    const reasonInput = new TextInputBuilder()
      .setCustomId("suggest_reason")
      .setLabel("Why should we approve this?")
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder("Explain the benefit or reasoning behind your suggestion")
      .setRequired(true);

    const rows = [
      new ActionRowBuilder().addComponents(usernameInput),
      new ActionRowBuilder().addComponents(suggestionInput),
      new ActionRowBuilder().addComponents(reasonInput),
    ];

    modal.addComponents(rows);
    await interaction.showModal(modal);
  },
};

// ───────────────────────────────
// 📩 Handle Modal Submission
// ───────────────────────────────
export async function handleSuggestModal(interaction) {
  if (interaction.customId !== "suggest_modal") return;

  await interaction.deferReply({ flags: 64 });

  const username = interaction.fields.getTextInputValue("suggest_username");
  const suggestion = interaction.fields.getTextInputValue("suggest_text");
  const reason = interaction.fields.getTextInputValue("suggest_reason");

  try {
    const boardId = "DKT2EOoh";

    // 🔍 Get lists from the Trello board
    const listsRes = await fetch(
      `https://api.trello.com/1/boards/${boardId}/lists?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`
    );
    const lists = await listsRes.json();

    const suggestList = lists.find(l => l.name.toLowerCase() === "suggestions");
    if (!suggestList) {
      return interaction.editReply("❌ Could not find the **'Suggestions'** list on Trello.");
    }

    // 🔖 Get the “Awaiting Review” label
    const labelsRes = await fetch(
      `https://api.trello.com/1/boards/${boardId}/labels?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`
    );
    const labels = await labelsRes.json();
    const label = labels.find(l => l.name.toLowerCase() === "awaiting review");

    // 🗂️ Create Trello Card
    const desc = [
      `**Username:** ${username}`,
      `**Discord ID:** ${interaction.user.id}`,
      `**Suggestion:** ${suggestion}`,
      `**Why do you believe we should approve this suggestion?**`,
      `${reason}`,
    ].join("\n");

    const cardBody = {
      idList: suggestList.id,
      name: "Suggestion",
      desc,
      idLabels: label ? [label.id] : [],
    };

    const cardRes = await fetch(
      `https://api.trello.com/1/cards?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cardBody),
      }
    );

    if (!cardRes.ok) {
      const errTxt = await cardRes.text();
      throw new Error(`Trello API Error: ${errTxt}`);
    }

    const card = await cardRes.json();

    // ✅ Confirmation Embed
    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle("💡 Suggestion Submitted")
      .setDescription("Your suggestion has been sent to the RDUSA development Trello board.")
      .addFields(
        { name: "Suggestion", value: suggestion.length > 1024 ? `${suggestion.slice(0, 1021)}...` : suggestion },
        { name: "Reason", value: reason.length > 1024 ? `${reason.slice(0, 1021)}...` : reason }
      )
      .setFooter({ text: "Status: Awaiting Review" })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    console.log(`✅ Suggestion sent to Trello as card ${card.id}`);
  } catch (err) {
    console.error("❌ Error submitting suggestion:", err);
    await interaction.editReply({
      content: "❌ There was an error submitting your suggestion to Trello.",
    });
  }
}
