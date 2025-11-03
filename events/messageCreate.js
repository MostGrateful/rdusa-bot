// events/messageCreate.js
import { sendRaidAlertEmbed } from "../utils/raidActions.js";
import { logIncident } from "../utils/raidLogger.js";
import { EmbedBuilder } from "discord.js";

const spamTracker = new Map();
const SUSPICIOUS_PATTERNS = /(discord\.gg\/|nitro|free|gift|steam|giveaway)/i;
const MASS_MENTION_LIMIT = 5;
const SPAM_MESSAGE_LIMIT = 5;

export default {
  name: "messageCreate",
  async execute(message) {
    try {
      if (!message.guild || message.author.bot) return;

      const userId = message.author.id;
      const now = Date.now();

      if (!spamTracker.has(userId)) spamTracker.set(userId, []);
      const times = spamTracker.get(userId).filter((t) => now - t < 5000);
      times.push(now);
      spamTracker.set(userId, times);

      const isSpam = times.length >= SPAM_MESSAGE_LIMIT;
      const mentionCount = message.mentions.users.size + message.mentions.roles.size;
      const isMassMention = mentionCount >= MASS_MENTION_LIMIT || message.mentions.everyone;
      const isSuspiciousLink = SUSPICIOUS_PATTERNS.test(message.content);

      if (isSpam || isMassMention || isSuspiciousLink) {
        const reason = isSpam
          ? "Spam Flood"
          : isMassMention
          ? "Mass Mentions / Everyone Spam"
          : "Suspicious or Scam Link";

        const embed = new EmbedBuilder()
          .setColor(0xed4245)
          .setTitle("🚨 Raid / Spam Alert Triggered")
          .setDescription(
            `**User:** ${message.author.tag} (<@${userId}>)\n` +
              `**Reason:** ${reason}\n` +
              `**Channel:** <#${message.channel.id}>\n\n` +
              `**Message Content:**\n${message.content.slice(0, 4000)}`
          )
          .setFooter({ text: `Detected in ${message.guild.name}` })
          .setTimestamp();

        const alertChannel = await message.client.channels.fetch("1434698676629930085").catch(() => null);
        if (alertChannel)
          await alertChannel.send({
            content: `<@&1332198672720723988> <@&1414494108168487005>`,
            embeds: [embed],
          });

        const devLog = await message.client.channels.fetch(process.env.DEV_LOG_CHANNEL_ID).catch(() => null);
        if (devLog)
          await devLog.send({
            embeds: [
              new EmbedBuilder()
                .setColor(0xed4245)
                .setTitle("⚠️ Spam / Raid Message Detected")
                .setDescription(
                  `Guild: **${message.guild.name}**\nUser: **${message.author.tag}**\nReason: ${reason}`
                )
                .setTimestamp(),
            ],
          });

        // 🔹 log incident
        logIncident({
          guildId: message.guild.id,
          guildName: message.guild.name,
          type: reason,
          detectedBy: "Automated System",
          usersFlagged: [{ id: message.author.id, tag: message.author.tag }],
          count: 1,
        });
      }

      setTimeout(() => spamTracker.delete(userId), 10_000);
    } catch (err) {
      console.error("Error in messageCreate (raid detection):", err);
    }
  },
};
