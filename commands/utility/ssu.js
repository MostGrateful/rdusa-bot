// commands/utility/ssu.js
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
} from "discord.js";

const SSU_CHANNEL_ID = "1388884153470029834"; // SSU announcements channel
const PING_ROLE_ID = "1347708867370418267";   // SSU ping role
const COOLDOWN_MS = 2 * 60 * 60 * 1000;       // 2 hours in ms
const CONFIG_ROW_ID = 1;                      // bot_config row id

export default {
  data: new SlashCommandBuilder()
    .setName("ssu")
    .setDescription("Announce a Server Start-Up (SSU) event with live status controls."),

  async execute(interaction, client) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const db = client.db;
    if (!db) {
      return interaction.editReply("❌ Database connection is unavailable.");
    }

    const ssuChannel = await client.channels.fetch(SSU_CHANNEL_ID).catch(() => null);
    if (!ssuChannel) {
      return interaction.editReply("❌ SSU channel not found.");
    }

    const now = Date.now();

    // ───────────────────────────────
    // ⏳ SQL-Based Cooldown
    // ───────────────────────────────
    try {
      const [rows] = await db.query(
        "SELECT last_ssu_time FROM bot_config WHERE id = ?",
        [CONFIG_ROW_ID]
      );

      let lastSSU = rows.length ? Number(rows[0].last_ssu_time) || 0 : 0;
      const elapsed = now - lastSSU;

      if (lastSSU > 0 && elapsed < COOLDOWN_MS) {
        const remaining = COOLDOWN_MS - elapsed;
        const minutes = Math.ceil(remaining / 60000);

        const cdEmbed = new EmbedBuilder()
          .setColor(0xed4245)
          .setTitle("⏳ SSU Cooldown Active")
          .setDescription(`You must wait **${minutes} minutes** before starting another SSU.`)
          .setTimestamp();

        return interaction.editReply({ embeds: [cdEmbed], flags: MessageFlags.Ephemeral });
      }

      // Update cooldown time
      await db.query(
        "UPDATE bot_config SET last_ssu_time = ? WHERE id = ?",
        [now, CONFIG_ROW_ID]
      );
    } catch (err) {
      console.error("⚠️ SSU Cooldown Error:", err);
    }

    // ───────────────────────────────
    // 🟢 SSU ANNOUNCEMENT EMBED
    // ───────────────────────────────
    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle("🟢 Server Start-Up (SSU)")
      .setDescription(
        `**Attention <@&${PING_ROLE_ID}>!**\n\n` +
        `The server is now starting up!\n\n` +
        `📍 **Location:** [Fort Hood, Texas](https://www.roblox.com/games/134569330405044/Fort-Hood-Texas)`
      )
      .addFields({ name: "Status", value: "🟢 **Active**" })
      .setFooter({ text: `Announced by ${interaction.user.tag}` })
      .setTimestamp();

    // Buttons
    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`ssu_complete_${interaction.user.id}`)
        .setLabel("Completed")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`ssu_cancel_${interaction.user.id}`)
        .setLabel("Cancelled")
        .setStyle(ButtonStyle.Danger)
    );

    const sentMessage = await ssuChannel.send({
      content: `<@&${PING_ROLE_ID}>`,
      embeds: [embed],
      components: [buttons],
    });

    await interaction.editReply("✅ SSU announcement posted.");

    // ───────────────────────────────
    // 🎯 BUTTON COLLECTOR
    // ───────────────────────────────
    const commander = interaction.user.id;
    const collector = sentMessage.createMessageComponentCollector();

    collector.on("collect", async (btnInt) => {
      const isAdmin = btnInt.member.permissions.has(PermissionFlagsBits.Administrator);
      const isOwner = btnInt.user.id === commander;

      if (!isOwner && !isAdmin) {
        return btnInt.reply({
          content: "❌ You may not control this SSU announcement.",
          flags: MessageFlags.Ephemeral,
        });
      }

      // COMPLETED
      if (btnInt.customId === `ssu_complete_${commander}`) {
        const modal = new ModalBuilder()
          .setCustomId(`ssu_modal_${commander}`)
          .setTitle("SSU Completion Details")
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("attendeeCount")
                .setLabel("Number of Attendees")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("attendeeNames")
                .setLabel("Names of Attendees")
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
            )
          );

        await btnInt.showModal(modal);

        const modalSubmit = await btnInt
          .awaitModalSubmit({
            filter: (i) =>
              i.customId === `ssu_modal_${commander}` && i.user.id === btnInt.user.id,
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

        const finalEmbed = EmbedBuilder.from(embed)
          .setColor(0x2ecc71)
          .spliceFields(0, 1, { name: "Status", value: "🟩 **Completed**" })
          .addFields(
            { name: "Attendees", value: `👥 ${count}` },
            { name: "Names", value: names }
          );

        await sentMessage.edit({ embeds: [finalEmbed], components: [] });

        await modalSubmit.reply({
          content: "✅ SSU marked as completed.",
          flags: MessageFlags.Ephemeral,
        });
      }

      // CANCELLED
      if (btnInt.customId === `ssu_cancel_${commander}`) {
        const finalEmbed = EmbedBuilder.from(embed)
          .setColor(0xed4245)
          .spliceFields(0, 1, { name: "Status", value: "🔴 **Cancelled**" });

        await sentMessage.edit({ embeds: [finalEmbed], components: [] });

        return btnInt.reply({
          content: "❌ SSU cancelled.",
          flags: MessageFlags.Ephemeral,
        });
      }
    });
  },
};
