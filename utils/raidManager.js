// utils/raidManager.js
import { EmbedBuilder } from "discord.js";

const raidCache = new Map();

/**
 * Adds a new member join to the guild’s join tracker.
 * Detects potential mass joins & returns true if a raid threshold is hit.
 */
export async function handleMemberJoin(member, client) {
  const guildId = member.guild.id;
  const now = Date.now();

  if (!raidCache.has(guildId)) raidCache.set(guildId, []);
  const joins = raidCache.get(guildId);

  // keep only last 10 seconds of joins
  const recentJoins = joins.filter((t) => now - t < 10_000);
  recentJoins.push(now);
  raidCache.set(guildId, recentJoins);

  // 🧒 check if the account is < 30 days old
  const accountAgeDays = Math.floor((now - member.user.createdTimestamp) / (1000 * 60 * 60 * 24));
  const isNewAccount = accountAgeDays < 30;

  // 🚨 trigger threshold
  const isRaid = recentJoins.length >= 5;

  if (isRaid) {
    await sendRaidAlert(member.guild, client, recentJoins.length);
  } else if (isNewAccount) {
    await sendSuspiciousJoin(member.guild, client, member, accountAgeDays);
  }
}

/** posts a brief “suspicious join” notice to dev logs */
async function sendSuspiciousJoin(guild, client, member, age) {
  try {
    const devLog = await client.channels.fetch(process.env.DEV_LOG_CHANNEL_ID);
    if (!devLog) return;
    const embed = new EmbedBuilder()
      .setColor(0xfee75c)
      .setTitle("🕵️ Suspicious Account Joined")
      .setDescription(
        `**User:** ${member.user.tag} (<@${member.user.id}>)\n` +
          `**Account Age:** ${age} day(s)\n**Guild:** ${guild.name}`
      )
      .setTimestamp();
    await devLog.send({ embeds: [embed] });
  } catch (err) {
    console.error("Failed to log suspicious join:", err);
  }
}

/** posts the main raid alert embed */
async function sendRaidAlert(guild, client, count) {
  try {
    const alertChannel = await client.channels.fetch("1434698676629930085");
    if (!alertChannel) return;

    const embed = new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle("⚠️ RAID DETECTED")
      .setDescription(
        `Detected **${count}** joins within 10 seconds.\n\n` +
          `Awaiting authorization from <@&1332198672720723988> (High Command)\n` +
          `and <@&1414494108168487005> (Low Rank Admins).`
      )
      .setFooter({ text: `Guild ID: ${guild.id}` })
      .setTimestamp();

    await alertChannel.send({
      content: "<@&1332198672720723988> <@&1414494108168487005>",
      embeds: [embed],
    });

    const devLog = await client.channels.fetch(process.env.DEV_LOG_CHANNEL_ID);
    if (devLog) {
      await devLog.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0xed4245)
            .setTitle("🚨 Raid Detection Triggered")
            .setDescription(
              `Guild: **${guild.name}** (${guild.id})\nJoins in 10 s: **${count}**`
            )
            .setTimestamp(),
        ],
      });
    }
  } catch (err) {
    console.error("Failed to send raid alert:", err);
  }
}

// clean old entries every 5 minutes
setInterval(() => {
  const cutoff = Date.now() - 10_000;
  for (const [id, arr] of raidCache.entries()) {
    raidCache.set(id, arr.filter((t) => t > cutoff));
  }
}, 5 * 60 * 1000);
