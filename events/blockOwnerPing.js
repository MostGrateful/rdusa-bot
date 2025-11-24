// events/blockOwnerPing.js
import { EmbedBuilder } from "discord.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ───────────────────────────────
// 📁 Path + config setup
// ───────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// data/antiPingConfig.json (shared with /antiping)
const dataDir = path.join(__dirname, "../data");
const configPath = path.join(dataDir, "antiPingConfig.json");

// Ensure data dir + default config exist
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(configPath)) {
  fs.writeFileSync(
    configPath,
    JSON.stringify({ enabled: true }, null, 2),
    "utf8"
  );
}

function loadConfig() {
  try {
    const raw = fs.readFileSync(configPath, "utf8");
    return JSON.parse(raw);
  } catch {
    return { enabled: true };
  }
}

// ───────────────────────────────
// ⚙️ CONFIGURATION
// ───────────────────────────────

// 🔹 Exported so other files (like /antiping) can use it
export const PROTECTED_USER_IDS = [
  "238058962711216130",
  "539971080899526680", // You + extra
  // "123456789012345678", // Example extra protected user
];

// Users who ARE allowed to ping protected users (override anti-ping)
const WHITELISTED_USER_IDS = [
  "238058962711216130",
  "539971080899526680",
  // "111111111111111111", // Example: trusted staff member user ID
];

// Roles that ARE allowed to ping protected users (override anti-ping)
const WHITELISTED_ROLE_IDS = [
  // "222222222222222222", // Example: High Command role ID
  // "333333333333333333", // Example: Developer role ID
];

export default {
  name: "messageCreate",

  async execute(message) {
    try {
      // Ignore bots and DMs
      if (!message.guild || message.author.bot) return;

      // 🔁 Respect global toggle
      const { enabled } = loadConfig();
      if (!enabled) return;

      // Does this message mention any protected user?
      const mentionsProtected = message.mentions.users.some((user) =>
        PROTECTED_USER_IDS.includes(user.id)
      );
      if (!mentionsProtected) return;

      // Fetch member for role checks
      const member = await message.guild.members
        .fetch(message.author.id)
        .catch(() => null);

      // ───────────────────────────────
      // ✅ Whitelist check
      // ───────────────────────────────
      let isWhitelisted = false;

      // 1) Whitelisted user IDs
      if (WHITELISTED_USER_IDS.includes(message.author.id)) {
        isWhitelisted = true;
      }

      // 2) Whitelisted roles
      if (member) {
        const hasWhitelistedRole = member.roles.cache.some((role) =>
          WHITELISTED_ROLE_IDS.includes(role.id)
        );
        if (hasWhitelistedRole) {
          isWhitelisted = true;
        }
      }

      // If whitelisted → allow ping, do nothing
      if (isWhitelisted) return;

      // ───────────────────────────────
      // 🚫 Block ping + warn
      // ───────────────────────────────

      // Try to delete the original message
      await message.delete().catch(() => null);

      // Build warning embed
      const warnEmbed = new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle("⚠️ Do Not Ping This User")
        .setDescription(
          `Hey <@${message.author.id}>, please do **not** ping this protected user.\n` +
          `If you need assistance, use the appropriate chain of command or support channels instead.`
        )
        .setFooter({ text: "RDUSA Bot • Ping Protection" })
        .setTimestamp();

      // Send warning in the same channel
      await message.channel
        .send({ content: `<@${message.author.id}>`, embeds: [warnEmbed] })
        .catch(() => null);
    } catch (err) {
      console.error("❌ Error in blockOwnerPing messageCreate handler:", err);
    }
  },
};
