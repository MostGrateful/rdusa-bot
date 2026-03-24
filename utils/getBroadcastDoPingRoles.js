// utils/getBroadcastDoPingRoles.js

/**
 * Returns an array of role IDs (strings) that should be pinged
 * for a broadcastdo message in a given guild.
 *
 * Expected SQL table:
 *   guild_broadcastdo_ping_roles (
 *     guild_id VARCHAR(32) NOT NULL,
 *     role_id  VARCHAR(32) NOT NULL,
 *     enabled  TINYINT(1) NOT NULL DEFAULT 1,
 *     updated_by VARCHAR(32) DEFAULT NULL,
 *     updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 *     PRIMARY KEY (guild_id, role_id)
 *   )
 *
 * @param {import("mysql2/promise").Pool} db
 * @param {string} guildId
 * @returns {Promise<string[]>}
 */
export async function getBroadcastDoPingRoles(db, guildId) {
  if (!db || !guildId) return [];

  try {
    const [rows] = await db.query(
      `SELECT role_id
       FROM guild_broadcastdo_ping_roles
       WHERE guild_id = ?
         AND enabled = 1`,
      [String(guildId)],
    );

    return (rows || [])
      .map((r) => String(r.role_id || "").trim())
      .filter(Boolean);
  } catch (e) {
    console.error("❌ getBroadcastDoPingRoles SQL error:", e);
    return [];
  }
}
