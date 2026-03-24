// commands/moderation/setmodlog.js
import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("setmodlog")
    .setDescription("Set the moderation log channel for this server.")
    .addChannelOption((opt) =>
      opt
        .setName("channel")
        .setDescription("Channel where moderation actions will be logged")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction, client) {
    await interaction.deferReply({ flags: 64 });

    if (!interaction.inGuild()) {
      return interaction.editReply("❌ This command must be used in a server.");
    }

    const channel = interaction.options.getChannel("channel", true);
    if (!channel.isTextBased()) {
      return interaction.editReply("❌ Please select a text-based channel.");
    }

    const db = client.db;
    if (!db) {
      return interaction.editReply("❌ Database not available.");
    }

    await db.query(
      `INSERT INTO guild_modlog_channels (guild_id, channel_id, set_by)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE
         channel_id = VALUES(channel_id),
         set_by = VALUES(set_by),
         set_at = CURRENT_TIMESTAMP`,
      [interaction.guild.id, channel.id, interaction.user.id]
    );

    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle("🛡️ Moderation Log Channel Set")
      .addFields(
        { name: "Channel", value: `<#${channel.id}>`, inline: false },
        { name: "Set By", value: `<@${interaction.user.id}>`, inline: false }
      )
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
  },
};
