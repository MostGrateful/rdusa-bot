// commands/admin/setbroadcastchannel.js
import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("setbroadcastchannel")
    .setDescription("Set the channel this server will receive DO broadcasts in.")
    .addChannelOption((o) =>
      o
        .setName("channel")
        .setDescription("Channel to receive broadcasts")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

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

    const channel = interaction.options.getChannel("channel", true);

    // sanity: ensure bot can send there
    const me = await interaction.guild.members.fetchMe().catch(() => null);
    if (!me) return interaction.editReply("❌ Could not verify bot permissions.");

    const perms = channel.permissionsFor(me);
    if (!perms?.has("ViewChannel") || !perms?.has("SendMessages")) {
      return interaction.editReply("❌ I don’t have permission to view/send messages in that channel.");
    }

    try {
      await db.query(
        `
        INSERT INTO guild_broadcast_config (guild_id, broadcast_channel_id, updated_by)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE
          broadcast_channel_id = VALUES(broadcast_channel_id),
          updated_by = VALUES(updated_by),
          updated_at = CURRENT_TIMESTAMP
        `,
        [interaction.guild.id, channel.id, interaction.user.id],
      );

      return interaction.editReply(`✅ Broadcast channel set to ${channel}.`);
    } catch (err) {
      console.error("❌ setbroadcastchannel DB error:", err);
      return interaction.editReply("❌ Failed to save broadcast channel to the database.");
    }
  },
};
