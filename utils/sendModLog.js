// utils/sendModLog.js
import { EmbedBuilder } from "discord.js";

/**
 * Fetch the moderation log channel ID for a guild.
 * @param {import("discord.js").Client} client
 * @param {string} guildId
 * @returns {Promise<string|null>}
 */
export async function getModLogChannelId(client, guildId) {
  const db = client.db;
  if (!db || !guildId) return null;

  try {
    const [rows] = await db.query(
      "SELECT channel_id FROM guild_modlog_channels WHERE guild_id = ? LIMIT 1",
      [guildId],
    );

    return rows?.[0]?.channel_id || null;
  } catch (err) {
    console.warn("⚠️ getModLogChannelId DB error:", err?.code || err);
    return null;
  }
}

/**
 * Send a moderation log message to the configured mod-log channel (per guild).
 *
 * @param {import("discord.js").Client} client
 * @param {string} guildId
 * @param {{
 *   content?: string,
 *   embeds?: import("discord.js").EmbedBuilder[]|import("discord.js").APIEmbed[],
 *   files?: any[]
 * }} payload
 * @returns {Promise<boolean>} true if sent, false otherwise
 */
export async function sendModLog(client, guildId, payload) {
  if (!client || !guildId || !payload) return false;

  const channelId = await getModLogChannelId(client, guildId);
  if (!channelId) return false;

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) return false;

  try {
    await channel.send(payload);
    return true;
  } catch (err) {
    console.warn("⚠️ sendModLog send error:", err?.code || err);
    return false;
  }
}

/**
 * Convenience helper: builds a basic moderation log embed.
 * Use this if you want a consistent style across commands.
 *
 * @param {{
 *  title: string,
 *  color?: number,
 *  fields?: {name: string, value: string, inline?: boolean}[],
 *  footerText?: string
 * }} opts
 */
export function buildModLogEmbed(opts) {
  const embed = new EmbedBuilder()
    .setTitle(opts.title || "Moderation Log")
    .setColor(typeof opts.color === "number" ? opts.color : 0x2b2d31)
    .setTimestamp();

  if (Array.isArray(opts.fields) && opts.fields.length) embed.addFields(opts.fields);
  if (opts.footerText) embed.setFooter({ text: opts.footerText });

  return embed;
}
