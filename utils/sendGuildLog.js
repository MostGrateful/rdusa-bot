import { EmbedBuilder } from "discord.js";

/**
 * Cache: guildId -> { channelId, expires }
 */
const cache = new Map();
const CACHE_TTL = 60_000; // 1 minute

// MUST match /setlog.js
const TABLE_NAME = "guild_log_config";

/**
 * Clear cache when /setlog updates a guild
 */
export function clearGuildLogCache(guildId) {
  cache.delete(guildId);
}

/**
 * Fetch log channel from SQL (cached)
 */
async function getLogChannelId(client, guildId) {
  if (!client?.db || !guildId) return null;

  const now = Date.now();
  const cached = cache.get(guildId);
  if (cached && cached.expires > now) {
    return cached.channelId;
  }

  const [rows] = await client.db.query(
    `SELECT log_channel_id FROM ${TABLE_NAME} WHERE guild_id = ? LIMIT 1`,
    [guildId],
  );

  const channelId = rows?.[0]?.log_channel_id || null;
  cache.set(guildId, {
    channelId,
    expires: now + CACHE_TTL,
  });

  return channelId;
}

/**
 * Send a log payload to the guild's configured log channel
 */
export async function sendGuildLog(client, guildId, payload) {
  try {
    const channelId = await getLogChannelId(client, guildId);
    if (!channelId) return false;

    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return false;

    await channel.send(payload);
    return true;
  } catch {
    return false;
  }
}

/**
 * Standard moderation / command log helper
 */
export async function logCommand(interaction, client, options = {}) {
  if (!interaction?.guildId) return;

  const embed = new EmbedBuilder()
    .setColor(0x2f3136)
    .setTitle("🛡️ Moderation Log")
    .addFields(
      { name: "Command", value: `/${interaction.commandName}`, inline: true },
      {
        name: "Moderator",
        value: `${interaction.user.tag} (${interaction.user.id})`,
        inline: true,
      },
      { name: "Channel", value: `<#${interaction.channelId}>`, inline: true },
    )
    .setTimestamp();

  if (options.action)
    embed.addFields({ name: "Action", value: options.action, inline: true });

  if (options.targetUser)
    embed.addFields({
      name: "Target",
      value: `${options.targetUser.tag} (${options.targetUser.id})`,
      inline: true,
    });

  if (options.reason)
    embed.addFields({
      name: "Reason",
      value: String(options.reason).slice(0, 1024),
    });

  if (options.note)
    embed.addFields({
      name: "Evidence / Notes",
      value: String(options.note).slice(0, 1024),
    });

  if (options.attachments?.length) {
    embed.addFields({
      name: "Attachments",
      value: options.attachments.map((u) => `• ${u}`).join("\n").slice(0, 1024),
    });
  }

  await sendGuildLog(client, interaction.guildId, { embeds: [embed] });
}
