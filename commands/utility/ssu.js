import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
  AttachmentBuilder,
} from "discord.js";

const cooldowns = new Map();

export default {
  data: new SlashCommandBuilder()
    .setName("ssu")
    .setDescription("Announce a Server Start-Up (SSU) event with live status controls."),

  async execute(interaction) {
    const message = interaction.options.getString("message") || "";
    const ssuChannelId = "1388884153470029834"; // ✅ Updated channel
    const pingRoleId = "1347708867370418267";
    const commandUserId = interaction.user.id;
    const now = Date.now();
    const cooldownDuration = 2 * 60 * 60 * 1000; // 2 hours

    const ssuChannel = await interaction.client.channels
      .fetch(ssuChannelId)
      .catch(() => null);

    if (!ssuChannel)
      return interaction.reply({
        content: "❌ SSU channel not found. Please check configuration.",
        flags: MessageFlags.Ephemeral,
      });

    // 🔁 Cooldown check
    const userCooldown = cooldowns.get(commandUserId);
    const timeLeft = userCooldown ? cooldownDuration - (now - userCooldown) : 0;
    const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);

    if (timeLeft > 0 && !isAdmin) {
      const remainingMinutes = Math.ceil(timeLeft / 60000);
      const embed = new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle("⏳ On Cooldown")
        .setDescription(`This command is still on cooldown for **${remainingMinutes} minute(s)**.`)
        .setFooter({ text: "Please wait before starting another SSU." })
        .setTimestamp();

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    // Set cooldown (resets if admin overrides)
    cooldowns.set(commandUserId, now);

    // 🟢 Create SSU embed
    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle("🟢 Server Start-Up (SSU)")
      .setDescription(
        `**Attention <@&${pingRoleId}>!**\n\nThe server is now starting up!\n\n📍 **Location:** [Fort Hood, Texas](https://www.roblox.com/games/134569330405044/Fort-Hood-Texas)\n\n${
          message ? `💬 **Additional Info:** ${message}` : ""
        }`
      )
      .addFields({ name: "Status", value: "🟢 **Active**" })
      .setFooter({ text: `Announced by ${interaction.user.tag}` })
      .setTimestamp();

    // 🎛️ Control buttons
    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`ssu_complete_${commandUserId}`)
        .setLabel("Completed")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`ssu_cancel_${commandUserId}`)
        .setLabel("Cancelled")
        .setStyle(ButtonStyle.Danger)
    );

    const sentMessage = await ssuChannel.send({
      content: `<@&${pingRoleId}>`,
      embeds: [embed],
      components: [buttons],
    });

    await interaction.reply({
      content: "✅ SSU announcement posted successfully with control buttons.",
      flags: MessageFlags.Ephemeral,
    });

    // 🎯 Button Collector
    const collector = sentMessage.createMessageComponentCollector();

    collector.on("collect", async (btnInt) => {
      const isButtonAdmin = btnInt.member.permissions.has(PermissionFlagsBits.Administrator);
      const isOwner = btnInt.user.id === commandUserId;

      if (!isOwner && !isButtonAdmin) {
        return btnInt.reply({
          content: "❌ You are not authorized to control this SSU announcement.",
          flags: MessageFlags.Ephemeral,
        });
      }

      // ✅ Completed Button
      if (btnInt.customId === `ssu_complete_${commandUserId}`) {
        const modal = new ModalBuilder()
          .setCustomId(`ssu_modal_${commandUserId}`)
          .setTitle("SSU Completion Details")
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("attendeeCount")
                .setLabel("Number of Attendees")
                .setStyle(TextInputStyle.Short)
                .setPlaceholder("Example: 5")
                .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("attendeeNames")
                .setLabel("Names of Attendees")
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder("Example: John, Sarah, Alex, Ryan, James")
                .setRequired(true)
            )
          );

        await btnInt.showModal(modal);

        const modalSubmit = await btnInt
          .awaitModalSubmit({
            filter: (i) =>
              i.customId === `ssu_modal_${commandUserId}` && i.user.id === btnInt.user.id,
            time: 180000,
          })
          .catch(() => null);

        if (!modalSubmit) {
          return btnInt.followUp({
            content: "❌ Timed out waiting for SSU completion details.",
            flags: MessageFlags.Ephemeral,
          });
        }

        const count = modalSubmit.fields.getTextInputValue("attendeeCount");
        const names = modalSubmit.fields.getTextInputValue("attendeeNames");

        await modalSubmit.reply({
          content:
            "📸 Please upload a screenshot of the SSU (optional). You have 1 minute to respond.",
          flags: MessageFlags.Ephemeral,
        });

        const collector = ssuChannel.createMessageCollector({
          filter: (m) => m.author.id === btnInt.user.id && m.attachments.size > 0,
          time: 60000,
          max: 1,
        });

        collector.on("collect", async (msg) => {
          const image = msg.attachments.first();

          const updatedEmbed = EmbedBuilder.from(embed)
            .setColor(0x57f287)
            .spliceFields(0, 1, { name: "Status", value: "🟩 **Completed**" })
            .addFields(
              { name: "Attendees", value: `👥 **${count}**`, inline: false },
              { name: "Names", value: `🧾 ${names}`, inline: false }
            )
            .setImage(image.url)
            .setTimestamp();

          await sentMessage.edit({ embeds: [updatedEmbed], components: [] });
          await msg.delete().catch(() => null);

          await ssuChannel.send({
            content: `✅ SSU Completed by <@${btnInt.user.id}>.`,
          });
        });

        collector.on("end", async (collected) => {
          if (collected.size === 0) {
            const updatedEmbed = EmbedBuilder.from(embed)
              .setColor(0x57f287)
              .spliceFields(0, 1, { name: "Status", value: "🟩 **Completed**" })
              .addFields(
                { name: "Attendees", value: `👥 **${count}**`, inline: false },
                { name: "Names", value: `🧾 ${names}`, inline: false }
              )
              .setTimestamp();

            await sentMessage.edit({ embeds: [updatedEmbed], components: [] });
            await ssuChannel.send({
              content: `✅ SSU Completed (no screenshot uploaded) by <@${btnInt.user.id}>.`,
            });
          }
        });
      }

      // 🔴 Cancelled Button
      if (btnInt.customId === `ssu_cancel_${commandUserId}`) {
        const updatedEmbed = EmbedBuilder.from(embed)
          .setColor(0xed4245)
          .spliceFields(0, 1, { name: "Status", value: "🔴 **Cancelled**" })
          .setTimestamp();

        await sentMessage.edit({ embeds: [updatedEmbed], components: [] });
        await btnInt.reply({
          content: "❌ SSU has been cancelled.",
          flags: MessageFlags.Ephemeral,
        });
      }
    });
  },
};
