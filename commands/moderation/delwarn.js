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
    .setName("delwarn")
    .setDescription("Delete a specific warning by its Case ID.")
    .addIntegerOption((opt) =>
      opt
        .setName("case")
        .setDescription("The Case ID of the warning to delete.")
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
    const caseId = interaction.options.getInteger("case", true);

    const isAdmin = moderator.permissions.has(PermissionFlagsBits.Administrator);
    const roleIds = moderator.roles.cache.map((r) => r.id);

    const hasPermission = await canUseModCommand(db, {
      guildId: guild.id,
      userId: moderator.id,
      roleIds,
      commandName: "delwarn",
      isAdmin,
    });

    if (!hasPermission) {
      return interaction.editReply(
        "🚫 You are not permitted to use moderation commands.\nIf this is incorrect, contact High Command."
      );
    }

    // 🔍 Get warning info first
    let rows;
    try {
      [rows] = await db.query(
        `SELECT id, guild_id, user_id, moderator_id, reason, created_at
         FROM mod_warnings
         WHERE id = ? AND guild_id = ?`,
        [caseId, guild.id]
      );
    } catch (err) {
      console.error("❌ Failed to fetch warning:", err);
      return interaction.editReply("❌ Failed to fetch that warning from the database.");
    }

    if (!rows || rows.length === 0) {
      return interaction.editReply(`❌ No warning found with **Case #${caseId}** in this server.`);
    }

    const warnRow = rows[0];

    // ❌ Delete it
    try {
      await db.query(
        `DELETE FROM mod_warnings WHERE id = ? AND guild_id = ?`,
        [caseId, guild.id]
      );
    } catch (err) {
      console.error("❌ Failed to delete warning:", err);
      return interaction.editReply("❌ Failed to delete that warning from the database.");
    }

    // ✏️ Build log embed
    let memberTag = `\`${warnRow.user_id}\``;
    let originalModTag = `\`${warnRow.moderator_id}\``;

    try {
      const memberUser = await client.users.fetch(warnRow.user_id).catch(() => null);
      if (memberUser) memberTag = `${memberUser.tag} (\`${memberUser.id}\`)`;

      const modUser = await client.users.fetch(warnRow.moderator_id).catch(() => null);
      if (modUser) originalModTag = `${modUser.tag} (\`${modUser.id}\`)`;
    } catch {
      // ignore
    }

    const logEmbed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`Warning Deleted | Case #${caseId}`)
      .addFields(
        { name: "Member", value: memberTag, inline: false },
        { name: "Original Moderator", value: originalModTag, inline: false },
        { name: "Original Reason", value: warnRow.reason || "No reason provided.", inline: false },
        {
          name: "Action Performed By",
          value: `${interaction.user.tag} (\`${interaction.user.id}\`)`,
          inline: false,
        }
      )
      .setTimestamp();

    // 🔔 Send to mod log
    try {
      const modChan = await client.channels.fetch(MOD_LOG_CHANNEL_ID);
      if (modChan && modChan.isTextBased()) {
        await modChan.send({ embeds: [logEmbed] });
      }
    } catch (err) {
      console.error("⚠️ Could not send mod log (delwarn):", err);
    }

    // 🔔 Dev log (optional)
    try {
      if (process.env.DEV_LOG_CHANNEL_ID) {
        const devChan = await client.channels.fetch(process.env.DEV_LOG_CHANNEL_ID);
        if (devChan && devChan.isTextBased()) {
          await devChan.send({ embeds: [logEmbed] });
        }
      }
    } catch (err) {
      console.error("⚠️ Dev log (delwarn) failed:", err);
    }

    return interaction.editReply(
      `✅ Successfully deleted warning **Case #${caseId}** from this server.`
    );
  },
};
