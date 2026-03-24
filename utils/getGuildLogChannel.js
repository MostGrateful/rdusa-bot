export async function getGuildLogChannel(client, guildId) {
  const db = client.db;
  if (!db) return null;

  try {
    const [rows] = await db.query(
      "SELECT log_channel_id FROM guild_log_config WHERE guild_id = ? LIMIT 1",
      [guildId],
    );
    const channelId = rows?.[0]?.log_channel_id;
    if (!channelId) return null;

    const ch = await client.channels.fetch(channelId).catch(() => null);
    if (!ch || !ch.isTextBased()) return null;

    return ch;
  } catch {
    return null;
  }
}
