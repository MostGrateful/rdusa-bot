/**
 * Universal moderation action logger
 * Writes to SQL table: mod_actions
 *
 * IMPORTANT:
 * - Provides BOTH a named export and a default export for compatibility.
 * - Never throws (so mod commands still work even if DB is down).
 */

export async function logModAction(db, action) {
  try {
    if (!db) return { ok: false, error: "DB not available" };

    const {
      guildId,
      targetUserId,
      targetTag = null,
      moderatorUserId,
      moderatorTag = null,
      actionType,
      reason = null,
      evidence = null,
      evidenceUrls = [],
      durationMs = null,
      expiresAt = null,
    } = action ?? {};

    if (!guildId || !targetUserId || !moderatorUserId || !actionType) {
      return { ok: false, error: "Missing required fields" };
    }

    const evidenceUrlsJson =
      Array.isArray(evidenceUrls) && evidenceUrls.length
        ? JSON.stringify(evidenceUrls)
        : null;

    const [result] = await db.query(
      `
      INSERT INTO mod_actions (
        guild_id,
        target_user_id,
        target_tag,
        moderator_user_id,
        moderator_tag,
        action_type,
        reason,
        evidence,
        evidence_urls,
        duration_ms,
        expires_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        guildId,
        targetUserId,
        targetTag,
        moderatorUserId,
        moderatorTag,
        String(actionType).toUpperCase(),
        reason,
        evidence,
        evidenceUrlsJson,
        durationMs,
        expiresAt ? new Date(expiresAt) : null,
      ],
    );

    return { ok: true, id: result?.insertId ?? null };
  } catch (err) {
    console.error("⚠️ modActionLogger error:", err);
    return { ok: false, error: err?.message || "Unknown SQL error" };
  }
}

// ✅ default export ALSO provided (doesn't hurt, helps if any file uses default import)
export default { logModAction };

