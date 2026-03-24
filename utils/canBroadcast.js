// utils/getBroadcastDoPingRoles.js
export async function getBroadcastDoPingRoles(db, guildId) {
  if (!db || !guildId) return [];

  try {
    const [rows] = await db.query(
      "SELECT role_id FROM guild_broadcastdo_ping_roles WHERE guild_id = ? AND enabled = 1",
      [guildId],
    );

    return (rows || [])
      .map((r) => String(r.role_id))
      .filter(Boolean);
  } catch (err) {
    console.error("❌ getBroadcastDoPingRoles SQL error:", err);
    return [];
  }
}
