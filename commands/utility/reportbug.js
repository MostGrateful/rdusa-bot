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

const { TRELLO_API_KEY, TRELLO_TOKEN, TRELLO_BUGS_BOARD_ID } = process.env;

export default {
  data: new SlashCommandBuilder()
    .setName("reportbug")
    .setDescription("Open a form to report a bug to the RDUSA development team."),

  async execute(interaction) {
    // 🧾 Step 1: Create and show the modal
    const modal = new ModalBuilder()
      .setCustomId("reportbug_modal")
      .setTitle("🐞 Report a Bug");

    const titleInput = new TextInputBuilder()
      .setCustomId("bug_title")
      .setLabel("Bug Title")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("Example: /checkrecord command not responding")
      .setRequired(true);

    const descInput = new TextInputBuilder()
      .setCustomId("bug_desc")
      .setLabel("Bug Description")
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder("Describe what happened, steps to reproduce, etc.")
      .setRequired(true);

    const severityInput = new TextInputBuilder()
      .setCustomId("bug_severity")
      .setLabel("Severity (Low, Medium, High, Critical)")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("Enter one: Low, Medium, High, Critical")
      .setRequired(true);

    const screenshotInput = new TextInputBuilder()
      .setCustomId("bug_screenshots")
      .setLabel("Screenshots (Links only)")
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder("Paste screenshot links (comma or space separated)")
      .setRequired(false); // optional, in case they don’t have any

    modal.addComponents(
      new ActionRowBuilder().addComponents(titleInput),
      new ActionRowBuilder().addComponents(descInput),
      new ActionRowBuilder().addComponents(severityInput),
      new ActionRowBuilder().addComponents(screenshotInput)
    );

    await interaction.showModal(modal);
  },
};

// ───────────────────────────────
// 📩 Handle Modal Submission
// ───────────────────────────────
export async function handleBugModal(interaction) {
  if (interaction.customId !== "reportbug_modal") return;

  await interaction.deferReply({ flags: 64 });

  const bugTitle = interaction.fields.getTextInputValue("bug_title");
  const bugDesc = interaction.fields.getTextInputValue("bug_desc");
  const bugSeverity = interaction.fields.getTextInputValue("bug_severity");
  const bugScreenshots = interaction.fields.getTextInputValue("bug_screenshots") || "None provided.";

  try {
    // 🔍 Get Trello lists
    const listsRes = await fetch(
      `https://api.trello.com/1/boards/${TRELLO_BUGS_BOARD_ID}/lists?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`
    );
    const lists = await listsRes.json();

    const bugList = lists.find(l => l.name.toLowerCase().includes("new bugs"));
    if (!bugList) {
      return interaction.editReply("❌ Could not find the **'New Bugs'** list on Trello.");
    }

    // 🔖 Find or create "Awaiting Review" label
    const labelsRes = await fetch(
      `https://api.trello.com/1/boards/${TRELLO_BUGS_BOARD_ID}/labels?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`
    );
    const labels = await labelsRes.json();
    let awaitingLabel = labels.find(l => l.name.toLowerCase() === "awaiting review");

    if (!awaitingLabel) {
      const createLabelRes = await fetch(
        `https://api.trello.com/1/labels?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            idBoard: TRELLO_BUGS_BOARD_ID,
            name: "Awaiting Review",
            color: "yellow",
          }),
        }
      );
      awaitingLabel = await createLabelRes.json();
    }

    // 🗂️ Create Trello card
    const cardBody = {
      idList: bugList.id,
      name: bugTitle,
      desc:
        `**Bug Title:** ${bugTitle}\n` +
        `**Description:** ${bugDesc}\n` +
        `**Severity:** ${bugSeverity}\n` +
        `**Screenshots:** ${bugScreenshots}\n` +
        `**Reported by:** ${interaction.user.tag} (${interaction.user.id})\n` +
        `**Reported at:** ${new Date().toLocaleString()}`,
      idLabels: [awaitingLabel.id],
    };

    const cardRes = await fetch(
      `https://api.trello.com/1/cards?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cardBody),
      }
    );

    const card = await cardRes.json();
    if (!card.id) throw new Error("Invalid Trello response");

    // ✅ Confirmation Embed
    const embed = new EmbedBuilder()
      .setColor(0xffcc00)
      .setTitle("🐞 Bug Report Submitted")
      .addFields(
        { name: "Bug Title", value: bugTitle },
        { name: "Description", value: bugDesc.length > 1024 ? bugDesc.slice(0, 1021) + "..." : bugDesc },
        { name: "Severity", value: bugSeverity },
        { name: "Screenshots", value: bugScreenshots },
        { name: "Status", value: "🟡 Awaiting Review" }
      )
      .setFooter({ text: "Sent to Trello Bug Tracker" })
      .setTimestamp();

    await interaction.editReply({
      content: `✅ Bug report submitted successfully!\n[View on Trello](https://trello.com/c/${card.id})`,
      embeds: [embed],
    });

  } catch (err) {
    console.error("❌ Error submitting bug:", err);
    await interaction.editReply("❌ There was an error submitting your bug report to Trello.");
  }
}
