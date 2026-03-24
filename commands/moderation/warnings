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
    .setName("warnings")
    .setDescription("View all warnings for a member.")
    .addUserOption((opt) =>
      opt
        .setName("user")
        .setDescription("The member to view warnings for.")
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

    // 🔒 SQL-based permission check
    const hasPermission = await canUseModCommand(db, {
      guildId: guild.id,
      userId: moderator.id,
      roleIds,
      commandName: "warnings",
      isAdmin,
    });

    if (!hasPermission) {
      return interaction.editReply(
        "🚫 You are not permitted to use moderation commands.\nIf this is incorrect, contact High Command."
      );
    }

    // 📥 Fetch warnings
    let rows;
    try {
      [rows] = await db.query(
        `SELECT id, moderator_id, reason, created_at
         FROM mod_warnings
         WHERE guild_id = ? AND user_id = ?
         ORDER BY id ASC`,
        [guild.id, targetUser.id]
      );
    } catch (err) {
      console.error("❌ Failed to fetch warnings:", err);
      return interaction.editReply("❌ Failed to fetch warnings from the database.");
    }

    if (!rows || rows.length === 0) {
      return interaction.editReply(
        `✅ **${targetUser.tag}** currently has **no recorded warnings** in this server.`
      );
    }

    const MAX_DISPLAY = 10;
    const total = rows.length;
    const displayRows = rows.slice(0, MAX_DISPLAY);

    const lines = await Promise.all(
      displayRows.map(async (w) => {
        let modTag = `\`${w.moderator_id}\``;
        try {
          const modUser = await client.users.fetch(w.moderator_id).catch(() => null);
          if (modUser) modTag = `${modUser.tag} (\`${modUser.id}\`)`;
        } catch {
          // ignore
        }

        const dateStr = w.created_at
          ? `<t:${Math.floor(Number(w.created_at) / 1000)}:f>`
          : "Unknown date";

        return `**Case #${w.id}** — ${dateStr}\n` +
               `• **Moderator:** ${modTag}\n` +
               `• **Reason:** ${w.reason}`;
      })
    );

    const embed = new EmbedBuilder()
      .setColor(0xfee75c)
      .setTitle(`Warnings for ${targetUser.tag}`)
      .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
      .setDescription(lines.join("\n\n"))
      .setFooter({
        text:
          total > MAX_DISPLAY
            ? `Showing ${MAX_DISPLAY} of ${total} warnings.`
            : `Total warnings: ${total}`,
      })
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
  },
};
