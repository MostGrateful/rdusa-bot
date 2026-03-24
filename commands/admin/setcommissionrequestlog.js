// commands/admin/setcommissionrequestlog.js
import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
} from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("setcommissionrequestlog")
    .setDescription("Set the channel used for commission request logs in this server.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption((opt) =>
      opt
        .setName("channel")
        .setDescription("Channel to log commission requests in")
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
    ),

  /**
   * @param {import("discord.js").ChatInputCommandInteraction} interaction
   * @param {import("discord.js").Client} client
   */
  async execute(interaction, client) {
    await interaction.deferReply({ flags: 64 });

    if (!interaction.inGuild() || !interaction.guild) {
      return interaction.editReply("❌ This command can only be used in a server.");
    }

    const db = client.db;
    if (!db) return interaction.editReply("❌ Database not available.");

    const guildId = interaction.guild.id;
    const channel = interaction.options.getChannel("channel", true);

    // Ensure it's a text-based guild channel (extra safety)
    if (!channel || !channel.isTextBased?.()) {
      return interaction.editReply("❌ Please choose a valid text channel.");
    }

    // Ensure table exists (matches YOUR schema field name)
    await db.query(`
      CREATE TABLE IF NOT EXISTS guild_commission_config (
        guild_id VARCHAR(32) PRIMARY KEY,
        commission_log_channel_id VARCHAR(32) NOT NULL,
        updated_by VARCHAR(32) NULL,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );
    `);

    // Upsert using YOUR column name
    await db.query(
      `
      INSERT INTO guild_commission_config (guild_id, commission_log_channel_id, updated_by)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE
        commission_log_channel_id = VALUES(commission_log_channel_id),
        updated_by = VALUES(updated_by),
        updated_at = CURRENT_TIMESTAMP;
      `,
      [guildId, channel.id, interaction.user.id],
    );

    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle("✅ Commission Request Log Updated")
      .setDescription(`Commission requests will now be logged in ${channel}.`)
      .addFields(
        { name: "Server", value: interaction.guild.name, inline: true },
        { name: "Channel", value: `${channel} (${channel.id})`, inline: true },
        { name: "Set By", value: `<@${interaction.user.id}>`, inline: false },
      )
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
  },
};
