// utils/modPermissions.js

/**
 * Check if a user can use a moderation command,
 * based on SQL-stored roles/users.
 *
 * @param {import('mysql2/promise').Pool} db
 * @param {{
 *   guildId: string,
 *   userId: string,
 *   roleIds: string[],
 *   commandName: string,
 *   isAdmin?: boolean
 * }} ctx
 * @returns {Promise<boolean>}
 */
export async function canUseModCommand(db, ctx) {
  const { guildId, userId, roleIds, commandName, isAdmin = false } = ctx;

  // Admins always allowed as a safety net
  if (isAdmin) return true;

  if (!db || !guildId) return false;

  try {
    const [rows] = await db.query(
      `SELECT type, target_id
         FROM mod_permissions
        WHERE guild_id = ?
          AND (command_name = ? OR command_name = '*')`,
      [guildId, commandName]
    );

    // No config → deny by default
    if (!rows || rows.length === 0) return false;

    for (const row of rows) {
      if (row.type === "user" && row.target_id === userId) {
        return true;
      }

      if (row.type === "role" && roleIds.includes(row.target_id)) {
        return true;
      }
    }

    return false;
  } catch (err) {
    console.error("❌ canUseModCommand error:", err);
    // Fail-safe: deny if DB breaks
    return false;
  }
}
