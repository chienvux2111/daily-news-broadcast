/**
 * Cleanup service — deletes old run_history by tier retention policy
 * Runs daily via cron (3 AM UTC)
 * Uses a single JOIN-based query to avoid N+1 pattern
 */

const RETENTION_DAYS = { free: 7, pro: 30, business: 90 };

/**
 * Clean up old run history entries based on user plan retention
 * Single query approach — avoids per-user N+1 hitting CF Workers subrequest limits
 * @param {Object} db - D1 binding
 */
export async function cleanupRunHistory(db) {
  const now = Math.floor(Date.now() / 1000);
  const freeCutoff = now - (RETENTION_DAYS.free * 86400);
  const proCutoff = now - (RETENTION_DAYS.pro * 86400);
  const bizCutoff = now - (RETENTION_DAYS.business * 86400);

  const { meta } = await db.prepare(`
    DELETE FROM run_history WHERE id IN (
      SELECT r.id FROM run_history r
      JOIN "user" u ON u.id = r.user_id
      WHERE
        (u.plan = 'free' AND r.ran_at < ?)
        OR (u.plan = 'pro' AND r.ran_at < ?)
        OR (u.plan = 'business' AND r.ran_at < ?)
        OR (u.plan NOT IN ('free','pro','business') AND r.ran_at < ?)
    )
  `).bind(freeCutoff, proCutoff, bizCutoff, freeCutoff).run();

  console.log(`[Cleanup] Deleted ${meta.changes || 0} old run history entries`);
}
