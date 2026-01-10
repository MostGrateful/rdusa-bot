// commands/Moderation/warn.js
import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  MessageFlags,
} from "discord.js";
import { canUseModCommand } from "../../utils/modPermissions.js";

const MOD_LOG_CHANNEL_ID = "1388886511474442250"; // Mod log channel

export default {
  data: new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Issue a formal warning to a member.")
    .addUserOption((opt) =>
      opt
        .setName("user")
        .setDescription("The member you want to warn.")
        .setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("reason")
        .setDescription("Reason for the warning.")
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

    const isAdmin = moderator.permissions.has(PermissionFlagsBits.Administrator);
    const roleIds = moderator.roles.cache.map((r) => r.id);

    // 🔒 SQL-Based Permission Check
    const hasPermission = await canUseModCommand(db, {
      guildId: guild.id,
      userId: moderator.id,
      roleIds,
      commandName: "warn",
      isAdmin,
    });

    if (!hasPermission) {
      return interaction.editReply(
        "🚫 You are not permitted to use moderation commands.\nIf this is incorrect, contact High Command."
      );
    }

    const targetUser = interaction.options.getUser("user", true);
    const reason = interaction.options.getString("reason", true).slice(0, 1000);

    if (targetUser.id === interaction.user.id)
      return interaction.editReply("🚫 You cannot warn yourself.");

    if (targetUser.id === client.user.id)
      return interaction.editReply("🚫 You cannot warn the bot.");

    const now = Date.now();

    // 📌 Store the Warning in SQL
    let caseId;
    try {
      const [result] = await db.query(
        `INSERT INTO mod_warnings (guild_id, user_id, moderator_id, reason, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [guild.id, targetUser.id, moderator.id, reason, now]
      );

      caseId = result.insertId;
    } catch (err) {
      console.error("❌ Failed to write warning:", err);
      return interaction.editReply("❌ Failed to record warning.");
    }

    // 📩 DM the user (no moderator info)
    try {
      const dmEmbed = new EmbedBuilder()
        .setColor(0xfee75c)
        .setTitle("⚠️ You Have Been Warned")
        .setDescription(
          `You have received a formal warning in **${guild.name}**.\n\n` +
            `**Reason:** ${reason}`
        )
        .addFields({
          name: "Case ID",
          value: `#${caseId}`,
          inline: true,
        })
        .setTimestamp();

      await targetUser.send({ embeds: [dmEmbed] });
    } catch {
      // ignore DM failures silently
    }

    // 📜 Create Mod Log Embed (Dyno-style format)
    const logEmbed = new EmbedBuilder()
      .setColor(0xfee75c)
      .setAuthor({
        name: `${targetUser.tag}`,
        iconURL: targetUser.displayAvatarURL({ dynamic: true }),
      })
      .setTitle(`Warn | Case #${caseId}`)
      .addFields(
        {
          name: "Member",
          value: `${targetUser} (\`${targetUser.id}\`)`,
          inline: false,
        },
        {
          name: "Moderator",
          value: `${interaction.user.tag} (\`${interaction.user.id}\`)`,
          inline: false,
        },
        {
          name: "Reason",
          value: reason,
          inline: false,
        }
      )
      .setTimestamp();

    // 📡 Send to Mod Log Channel
    try {
      const modChan = await client.channels.fetch(MOD_LOG_CHANNEL_ID);
      if (modChan && modChan.isTextBased()) {
        await modChan.send({ embeds: [logEmbed] });
      }
    } catch (err) {
      console.error("⚠️ Could not send mod log:", err);
    }

    // 📡 Send to Developer Log (if set)
    try {
      if (process.env.DEV_LOG_CHANNEL_ID) {
        const devChan = await client.channels.fetch(process.env.DEV_LOG_CHANNEL_ID);
        if (devChan && devChan.isTextBased()) {
          await devChan.send({ embeds: [logEmbed] });
        }
      }
    } catch (err) {
      console.error("⚠️ Developer log failed:", err);
    }

    // Reply to moderator
    return interaction.editReply(
      `✅ Warning issued to **${targetUser.tag}**.\nCase ID: **#${caseId}**`
    );
  },
};
