import {
  SlashCommandBuilder,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  MessageFlags,
} from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("modifyrules")
    .setDescription("Create or modify rule sections via a Discord form."),

  async execute(interaction) {
    const rulesChannelId = "1347436771444523089"; // ✅ Rules channel
    const devLogId = process.env.DEV_LOG_CHANNEL_ID;

    // 🧾 Create the form modal
    const modal = new ModalBuilder()
      .setCustomId("modifyrules_modal")
      .setTitle("📜 Modify Rules Section");

    const titleInput = new TextInputBuilder()
      .setCustomId("rule_title")
      .setLabel("Section Title (supports emojis)")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("Example: 🛡️ General Conduct or <:custom:1234567890>")
      .setRequired(true);

    const descInput = new TextInputBuilder()
      .setCustomId("rule_description")
      .setLabel("Description / Rule Details")
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder("Describe your rule(s)... supports emojis and formatting.")
      .setRequired(true);

    const footerInput = new TextInputBuilder()
      .setCustomId("rule_footer")
      .setLabel("Footer (optional)")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("Example: Enforced by Administration")
      .setRequired(false);

    modal.addComponents(
      new ActionRowBuilder().addComponents(titleInput),
      new ActionRowBuilder().addComponents(descInput),
      new ActionRowBuilder().addComponents(footerInput)
    );

    await interaction.showModal(modal);

    // ⏳ Wait for submission
    const submission = await interaction
      .awaitModalSubmit({
        filter: (i) => i.customId === "modifyrules_modal" && i.user.id === interaction.user.id,
        time: 120000, // 2 min timeout
      })
      .catch(() => null);

    if (!submission) {
      return interaction.followUp({
        content: "❌ You took too long to submit the form. Please try again.",
        flags: MessageFlags.Ephemeral,
      });
    }

    // 🧾 Extract values
    const title = submission.fields.getTextInputValue("rule_title");
    const description = submission.fields.getTextInputValue("rule_description");
    const footer = submission.fields.getTextInputValue("rule_footer")?.trim();

    // 🟩 Build embed
    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle(title)
      .setDescription(description)
      .setTimestamp();

    if (footer && footer.length > 0) {
      embed.setFooter({ text: footer });
    } else {
      embed.setFooter({
        text: `Posted by ${submission.user.tag}`,
        iconURL: submission.user.displayAvatarURL(),
      });
    }

    // 📨 Send to Rules Channel
    const rulesChannel = await interaction.client.channels.fetch(rulesChannelId).catch(() => null);
    if (!rulesChannel) {
      return submission.reply({
        content: "❌ Could not find the rules channel. Please check configuration.",
        flags: MessageFlags.Ephemeral,
      });
    }

    await rulesChannel.send({ embeds: [embed] });

    await submission.reply({
      content: `✅ Successfully added/modified a rules section titled **${title}**.`,
      flags: MessageFlags.Ephemeral,
    });

    // 🪵 Developer Log
    if (devLogId) {
      const devLog = await interaction.client.channels.fetch(devLogId).catch(() => null);
      if (devLog) {
        const logEmbed = new EmbedBuilder()
          .setColor(0x57f287)
          .setTitle("📝 Rule Section Modified")
          .addFields(
            { name: "Title", value: title, inline: false },
            { name: "Posted By", value: `${submission.user.tag}`, inline: true },
            { name: "Guild", value: interaction.guild.name, inline: true }
          )
          .setFooter({ text: "Developer Log - Rule Management System" })
          .setTimestamp();

        await devLog.send({ embeds: [logEmbed] });
      }
    }
  },
};
