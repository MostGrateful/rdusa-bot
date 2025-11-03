// events/guildMemberAdd.js
import {
  sendRaidAlertEmbed,
  applyLockdown,
} from "../utils/raidActions.js";
import { logIncident } from "../utils/raidLogger.js";
import { EmbedBuilder } from "discord.js";
import dotenv from "dotenv";
dotenv.config();

const RAID_ALERT_CHANNEL = "1434698676629930085";
const HIGH_COMMAND_ROLE = "1332198672720723988";
const LOW_RANK_ROLE = "1414494108168487005";
const DEV_LOG_CHANNEL = process.env.DEV_LOG_CHANNEL_ID;

// Store recent join timestamps (for rate detection)
const joinTimestamps = new Map();
const RAID_THRESHOLD = 5; // number of joins
const TIME_WINDOW = 10000; // 10 seconds

export default {
  name: "guildMemberAdd",
  async execute(member) {
    const guild = member.guild;
    const now = Date.now();

    // Track member joins
    if (!joinTimestamps.has(guild.id)) joinTimestamps.set(guild.id, []);
    const timestamps = joinTimestamps.get(guild.id);
    timestamps.push(now);

    // Remove old timestamps outside of window
    const recent = timestamps.filter((t) => now - t < TIME_WINDOW);
    joinTimestamps.set(guild.id, recent);

    // If threshold met, trigger detection
    if (recent.length >= RAID_THRESHOLD) {
      console.warn(`⚠️ Possible raid detected in ${guild.name}`);
      const flaggedUsers = guild.members.cache
        .filter((m) => (now - m.joinedTimestamp) < TIME_WINDOW)
        .map((m) => ({ id: m.id, tag: m.user.tag }));

      // Log the incident
      logIncident({
        guildId: guild.id,
        guildName: guild.name,
        type: "Mass Join",
        detectedBy: "Automated System",
        usersFlagged: flaggedUsers,
        count: flaggedUsers.length,
      }, member.client);

      // Send alerts
      await sendRaidAlertEmbed(guild, "Mass Join", flaggedUsers, member.client);

      // Apply lockdown immediately
      await applyLockdown(guild, "Mass join raid detected");

      // Send developer log
      try {
        const devChannel = await member.client.channels.fetch(DEV_LOG_CHANNEL).catch(() => null);
        if (devChannel) {
          const embed = new EmbedBuilder()
            .setColor(0xed4245)
            .setTitle("🚨 Raid Detection Triggered")
            .setDescription(
              `Guild: **${guild.name}**\n` +
              `Type: **Mass Join**\n` +
              `Detected by: Automated System\n` +
              `Users flagged: ${flaggedUsers.length}`
            )
            .addFields({
              name: "Flagged Users",
              value: flaggedUsers.length
                ? flaggedUsers.map((u) => `• <@${u.id}> (${u.tag})`).join("\n").slice(0, 1024)
                : "No users found",
            })
            .setFooter({ text: "Raid Protection System" })
            .setTimestamp();

          await devChannel.send({
            content: `<@&${HIGH_COMMAND_ROLE}> <@&${LOW_RANK_ROLE}> ⚠️ Automated Raid Alert`,
            embeds: [embed],
          });
        }
      } catch (err) {
        console.error("❌ Error sending dev alert:", err);
      }
    }
  },
};
