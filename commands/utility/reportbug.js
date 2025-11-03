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
    .setName("reportbug")
    .setDescription("Submit a bot bug report directly to the development team."),

  async execute(interaction) {
    const bugChannelId = "1389116998344249404"; // ✅ Dev server bug reports channel
    const devLogId = process.env.DEV_LOG_CHANNEL_ID;

    // 🧾 Create modal form
    const modal = new ModalBuilder()
      .setCustomId("reportbug_modal")
      .setTitle("🐛 Report a Bot Bug");

    const robloxUserInput = new TextInputBuilder()
      .setCustomId("roblox_username")
      .setLabel("Roblox Username")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("Example: james_ashworth")
      .setRequired(true);

    const robloxIdInput = new TextInputBuilder()
      .setCustomId("roblox_id")
      .setLabel("Roblox User ID")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("Example: 1234567890")
      .setRequired(true);

    const bugDescInput = new TextInputBuilder()
      .setCustomId("bug_description")
      .setLabel("Describe the Bug")
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder("Explain what happened, when it occurred, etc.")
      .setRequired(true);

    const recreateInput = new TextInputBuilder()
      .setCustomId("can_recreate")
      .setLabel("Can this bug be recreated? (Yes/No)")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("Yes or No")
      .setRequired(true);

    const screenshotInput = new TextInputBuilder()
      .setCustomId("bug_screenshot")
      .setLabel("Screenshot URL(s) (Optional)")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("https://example.com/image.png, https://example.com/image2.png")
      .setRequired(false);

    modal.addComponents(
      new ActionRowBuilder().addComponents(robloxUserInput),
      new ActionRowBuilder().addComponents(robloxIdInput),
      new ActionRowBuilder().addComponents(bugDescInput),
      new ActionRowBuilder().addComponents(recreateInput),
      new ActionRowBuilder().addComponents(screenshotInput)
    );

    await interaction.showModal(modal);

    // ⏳ Wait for submission
    const submission = await interaction
      .awaitModalSubmit({
        filter: (i) => i.customId === "reportbug_modal" && i.user.id === interaction.user.id,
        time: 120000, // 2 minutes
      })
      .catch(() => null);

    if (!submission) {
      return interaction.followUp({
        content: "❌ You took too long to submit the bug report. Please try again.",
        flags: MessageFlags.Ephemeral,
      });
    }

    // 📋 Extract values
    const robloxUsername = submission.fields.getTextInputValue("roblox_username");
    const robloxId = submission.fields.getTextInputValue("roblox_id");
    const bugDescription = submission.fields.getTextInputValue("bug_description");
    const canRecreate = submission.fields.getTextInputValue("can_recreate");
    const screenshots = submission.fields.getTextInputValue("bug_screenshot")?.trim() || null;

    // 🟩 Create embed
    const embed = new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle("🐛 Bug Report Submitted")
      .addFields(
        { name: "👤 Roblox Username", value: robloxUsername, inline: true },
        { name: "🆔 Roblox ID", value: robloxId, inline: true },
        {
          name: "🪧 Reported By",
          value: `${submission.user.tag} (<@${submission.user.id}>)`,
          inline: false,
        },
        {
          name: "🏛️ Server",
          value: `${interaction.guild?.name || "Direct Message"} (${interaction.guild?.id || "N/A"})`,
          inline: false,
        },
        { name: "📝 Bug Description", value: bugDescription, inline: false },
        { name: "🔁 Can Be Recreated?", value: canRecreate || "N/A", inline: true }
      )
      .setTimestamp()
      .setFooter({
        text: "Bug Report System • Thank you for helping improve the bot!",
        iconURL: submission.user.displayAvatarURL(),
      });

    // 🔗 Add screenshots (if valid)
    if (screenshots && /^https?:\/\/[^\s]+/.test(screenshots)) {
      embed.addFields({ name: "📸 Screenshot(s)", value: screenshots });
    } else if (screenshots) {
      embed.addFields({
        name: "📸 Screenshot(s)",
        value: "⚠️ Invalid link provided — screenshots ignored.",
      });
    }

    // 📨 Send to Dev Channel
    const bugChannel = await interaction.client.channels.fetch(bugChannelId).catch(() => null);
    if (!bugChannel) {
      return submission.reply({
        content: "❌ Could not find the bug report channel. Please contact a developer.",
        flags: MessageFlags.Ephemeral,
      });
    }

    await bugChannel.send({ embeds: [embed] });

    await submission.reply({
      content: "✅ Your bug report has been submitted to the development team. Thank you!",
      flags: MessageFlags.Ephemeral,
    });

    // 🪵 Developer Log
    if (devLogId) {
      const devLog = await interaction.client.channels.fetch(devLogId).catch(() => null);
      if (devLog) {
        const logEmbed = new EmbedBuilder()
          .setColor(0xfee75c)
          .setTitle("🧾 Bug Report Logged")
          .addFields(
            { name: "Reported By", value: submission.user.tag, inline: true },
            { name: "Roblox User", value: robloxUsername, inline: true },
            { name: "Guild", value: interaction.guild?.name || "DM", inline: true }
          )
          .setTimestamp();

        await devLog.send({ embeds: [logEmbed] });
      }
    }
  },
};
