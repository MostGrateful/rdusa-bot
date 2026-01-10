// events/blockOwnerPing.js
import { EmbedBuilder } from "discord.js";

/**
 * Anti-ping system:
 * - Uses SQL table: anti_ping_protected (id, user_id, enabled)
 * - If a user with enabled=1 is mentioned, the message is deleted
 *   unless the author is whitelisted (optional table anti_ping_whitelist)
 */
export default {
  name: "messageCreate",

  /**
   * @param {import('discord.js').Message} message
   * @param {import('discord.js').Client} client
   */
  async execute(message, client) {
    try {
      // Ignore bots and DMs
      if (!message.guild || message.author.bot) return;

      const db = client.db;
      if (!db) {
        console.warn("⚠️ Anti-ping: client.db is not available, skipping.");
        return;
      }

      // No mentions? Nothing to do.
      if (!message.mentions.users.size) return;

      // 1) Get all protected users + their enabled flag
      const [protectedRows] = await db.query(
        "SELECT user_id, enabled FROM anti_ping_protected"
      );

      if (!protectedRows.length) return;

      // Enabled protected IDs as strings
      const enabledProtectedIds = protectedRows
        .filter((row) => row.enabled)
        .map((row) => String(row.user_id));

      if (!enabledProtectedIds.length) return;

      // 2) Optional: user whitelist (anti_ping_whitelist)
      let whitelistedUserIds = [];
      try {
        const [whitelistRows] = await db.query(
          "SELECT user_id FROM anti_ping_whitelist"
        );
        whitelistedUserIds = whitelistRows.map((r) => String(r.user_id));
      } catch {
        // If table doesn't exist, silently ignore; anti-ping still works
      }

      const authorId = message.author.id;

      // If author is whitelisted, allow pings
      if (whitelistedUserIds.includes(authorId)) return;

      // 3) Check if any mentioned user is protected + enabled
      const mentionedProtected = [...message.mentions.users.values()].find(
        (user) => enabledProtectedIds.includes(user.id)
      );

      if (!mentionedProtected) return;

      // If they ping themselves, allow it
      if (mentionedProtected.id === authorId) return;

      // 4) Delete message + warn
      await message.delete().catch(() => null);

      const warnEmbed = new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle("⚠️ Do Not Ping This User")
        .setDescription(
          `Hey <@${authorId}>, please do **not** ping <@${mentionedProtected.id}>.\n` +
            `Their anti-ping protection is currently **enabled**.\n\n` +
            `If you need assistance, please use the appropriate support or chain-of-command channels instead.`
        )
        .setFooter({ text: "RDUSA Bot • Anti-Ping System" })
        .setTimestamp();

      const warningMsg = await message.channel
        .send({
          content: `<@${authorId}>`,
          embeds: [warnEmbed],
        })
        .catch(() => null);

      // Auto-delete the warning after 7 seconds (optional)
      if (warningMsg) {
        setTimeout(() => {
          warningMsg.delete().catch(() => null);
        }, 7000);
      }
    } catch (err) {
      console.error("❌ Error in blockOwnerPing (anti-ping):", err);
    }
  },
};
