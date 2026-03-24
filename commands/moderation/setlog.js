import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { clearGuildLogCache } from "../../utils/sendGuildLog.js";

export default {
  data: new SlashCommandBuilder()
    .setName("setlog")
    .setDescription("Set the server log channel for moderation and activity logs.")
    .addChannelOption((opt) =>
      opt
        .setName("channel")
        .setDescription("Channel to send logs to")
        .setRequired(true),
    ),

  async execute(interaction, client) {
    await interaction.deferReply({ flags: 64 });

    if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.editReply("🚫 You must have **Administrator** permissions to use this.");
    }

    const channel = interaction.options.getChannel("channel", true);
    if (!channel.isTextBased()) {
      return interaction.editReply("❌ Please select a text-based channel.");
    }

    const db = client.db;
    if (!db) return interaction.editReply("❌ Database unavailable.");

    await db.query(
      `
      INSERT INTO guild_log_config (guild_id, log_channel_id)
      VALUES (?, ?)
      ON DUPLICATE KEY UPDATE log_channel_id = VALUES(log_channel_id)
    `,
      [interaction.guildId, channel.id],
    );

    // 🔁 Refresh cache immediately
    clearGuildLogCache(interaction.guildId);

    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle("✅ Log Channel Updated")
      .setDescription(`Logs will now be sent to ${channel}.`)
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};
