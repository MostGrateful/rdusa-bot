import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  MessageFlags,
} from "discord.js";
import { canUseModCommand } from "../../utils/modPermissions.js";

const MOD_LOG_CHANNEL_ID = "1388886511474442250";

export default {
  data: new SlashCommandBuilder()
    .setName("clearwarnings")
    .setDescription("Clear ALL warnings for a member in this server.")
    .addUserOption((opt) =>
      opt
        .setName("user")
        .setDescription("The member whose warnings you want to clear.")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  /**
   * @param {import('discord.js').ChatInputCommandInteraction} interaction
   * @param {import('discord.js').Client} client
   */
  async execute(interaction, client) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const db = client.db;
    if (!db) return interaction.editReply("❌ Database connection error.");

    const guild = interaction.guild;
    const moderator = interaction.member;
    const targetUser = interaction.options.getUser("user", true);

    const isAdmin = moderator.permissions.has(PermissionFlagsBits.Administrator);
    const roleIds = moderator.roles.cache.map((r) => r.id);

    const hasPermission = await canUseModCommand(db, {
      guildId: guild.id,
      userId: moderator.id,
      roleIds,
      commandName: "clearwarnings",
      isAdmin,
    });

    if (!hasPermission) {
      return interaction.editReply(
        "🚫 You are not permitted to use moderation commands.\nIf this is incorrect, contact High Command."
      );
    }

    // Count first
    let rows;
    try {
      [rows] = await db.query(
        `SELECT COUNT(*) AS cnt
         FROM mod_warnings
         WHERE guild_id = ? AND user_id = ?`,
        [guild.id, targetUser.id]
      );
    } catch (err) {
      console.error("❌ Failed to count warnings:", err);
      return interaction.editReply("❌ Failed to check existing warnings.");
    }

    const total = rows?.[0]?.cnt || 0;
    if (total === 0) {
      return interaction.editReply(
        `✅ **${targetUser.tag}** does not have any warnings to clear.`
      );
    }

    // Delete all
    try {
      await db.query(
        `DELETE FROM mod_warnings WHERE guild_id = ? AND user_id = ?`,
        [guild.id, targetUser.id]
      );
    } catch (err) {
      console.error("❌ Failed to clear warnings:", err);
      return interaction.editReply("❌ Failed to clear warnings from the database.");
    }

    const logEmbed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle("Warnings Cleared")
      .addFields(
        {
          name: "Member",
          value: `${targetUser.tag} (\`${targetUser.id}\`)`,
          inline: false,
        },
        {
          name: "Total Warnings Removed",
          value: `${total}`,
          inline: false,
        },
        {
          name: "Action Performed By",
          value: `${interaction.user.tag} (\`${interaction.user.id}\`)`,
          inline: false,
        }
      )
      .setTimestamp();

    try {
      const modChan = await client.channels.fetch(MOD_LOG_CHANNEL_ID);
      if (modChan && modChan.isTextBased()) {
        await modChan.send({ embeds: [logEmbed] });
      }
    } catch (err) {
      console.error("⚠️ Could not send mod log (clearwarnings):", err);
    }

    try {
      if (process.env.DEV_LOG_CHANNEL_ID) {
        const devChan = await client.channels.fetch(process.env.DEV_LOG_CHANNEL_ID);
        if (devChan && devChan.isTextBased()) {
          await devChan.send({ embeds: [logEmbed] });
        }
      }
    } catch (err) {
      console.error("⚠️ Dev log (clearwarnings) failed:", err);
    }

    return interaction.editReply(
      `✅ Cleared **${total}** warning(s) for **${targetUser.tag}**.`
    );
  },
};
