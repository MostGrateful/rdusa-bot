// events/blockOwnerPing.js
import { EmbedBuilder } from "discord.js";

// Optional: roles that are allowed to ping protected users
const WHITELISTED_ROLE_IDS = [
  // "222222222222222222", // Example: High Command role
  // "333333333333333333", // Example: Developer role
];

export default {
  name: "messageCreate",

  /**
   * @param {import("discord.js").Message} message
   * @param {import("discord.js").Client} client
   */
  async execute(message, client) {
    try {
      // Ignore bots and DMs
      if (!message.guild || message.author.bot) return;

      const db = client.db;
      if (!db) {
        console.warn("⚠️ Anti-ping: client.db is not available.");
        return;
      }

      // No mentions → nothing to do
      if (message.mentions.users.size === 0) return;

      // ───────────────────────────────
      // 🔁 Global Anti-Ping Toggle (anti_ping_config)
      // ───────────────────────────────
      try {
        const [cfgRows] = await db.query(
          "SELECT enabled FROM anti_ping_config WHERE id = 1"
        );

        // If row missing or disabled → do nothing
        if (!cfgRows.length || !cfgRows[0].enabled) {
          return;
        }
      } catch (err) {
        console.warn("⚠️ Anti-ping: failed to read anti_ping_config, skipping.", err.message);
        return; // Fail-safe: don’t block pings if config read fails
      }

      // ───────────────────────────────
      // 🔍 Determine which mentions are protected
      // ───────────────────────────────
      const mentionedIds = [...message.mentions.users.keys()];
      const placeholders = mentionedIds.map(() => "?").join(",");

      const [protectedRows] = await db.query(
        `
          SELECT user_id
          FROM anti_ping_protected
          WHERE enabled = 1
            AND user_id IN (${placeholders})
        `,
        mentionedIds
      );

      // If none of the mentioned users are protected → exit
      if (!protectedRows.length) return;

      const protectedIds = protectedRows.map((r) => String(r.user_id));

      // ───────────────────────────────
      // ✅ Whitelist Check (Users + Roles)
      // ───────────────────────────────
      let isWhitelisted = false;

      // Check whitelisted users (anti_ping_whitelist)
      try {
        const [whitelistRows] = await db.query(
          "SELECT user_id FROM anti_ping_whitelist WHERE user_id = ?",
          [message.author.id]
        );
        if (whitelistRows.length > 0) {
          isWhitelisted = true;
        }
      } catch (err) {
        console.warn("⚠️ Anti-ping: failed to read anti_ping_whitelist:", err.message);
      }

      // Check whitelisted roles
      const member = await message.guild.members
        .fetch(message.author.id)
        .catch(() => null);

      if (member && WHITELISTED_ROLE_IDS.length > 0) {
        const hasWhitelistedRole = member.roles.cache.some((role) =>
          WHITELISTED_ROLE_IDS.includes(role.id)
        );
        if (hasWhitelistedRole) {
          isWhitelisted = true;
        }
      }

      // If the author is whitelisted → allow ping, do nothing
      if (isWhitelisted) return;

      // ───────────────────────────────
      // 🚫 Block ping + warn user
      // ───────────────────────────────
      await message.delete().catch(() => null);

      const firstProtected = protectedIds[0];

      const warnEmbed = new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle("⚠️ Do Not Ping This User")
        .setDescription(
          `Hey <@${message.author.id}>, please do **not** ping this protected user.\n` +
          `Protected User: <@${firstProtected}>\n\n` +
          `If you need assistance, please use the proper chain of command or support channels instead.`
        )
        .setFooter({ text: "RDUSA Bot • Anti-Ping System" })
        .setTimestamp();

      await message.channel
        .send({ content: `<@${message.author.id}>`, embeds: [warnEmbed] })
        .catch(() => null);
    } catch (err) {
      console.error("❌ Error in blockOwnerPing messageCreate handler:", err);
    }
  },
};
