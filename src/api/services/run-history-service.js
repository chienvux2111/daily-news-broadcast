/**
 * Run history service — CRUD for run_history table
 */

function uuid() { return crypto.randomUUID(); }
function now() { return Math.floor(Date.now() / 1000); }

/**
 * Save a run result (success or failure)
 */
export async function saveRunHistory(db, { userId, streamId, status, articlesCount = 0, error = null }) {
  const id = uuid();
  const ranAt = now();
  await db.prepare(
    `INSERT INTO run_history (id, user_id, stream_id, status, articles_count, error, ran_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, userId, streamId, status, articlesCount, error, ranAt).run();
  return { id, status, articlesCount, ranAt };
}

/**
 * List runs for a stream (paginated, user-scoped)
 */
export async function listRuns(db, userId, streamId, { limit = 20, offset = 0 } = {}) {
  const { results } = await db.prepare(
    `SELECT r.*, s.name as stream_name FROM run_history r
     LEFT JOIN streams s ON s.id = r.stream_id
     WHERE r.user_id = ? AND r.stream_id = ?
     ORDER BY r.ran_at DESC LIMIT ? OFFSET ?`
  ).bind(userId, streamId, limit, offset).all();
  return results;
}

/**
 * List all runs for a user (across all streams)
 */
export async function listAllRuns(db, userId, { limit = 20, offset = 0, status = null } = {}) {
  const sql = status
    ? `SELECT r.*, s.name as stream_name FROM run_history r
       LEFT JOIN streams s ON s.id = r.stream_id
       WHERE r.user_id = ? AND r.status = ?
       ORDER BY r.ran_at DESC LIMIT ? OFFSET ?`
    : `SELECT r.*, s.name as stream_name FROM run_history r
       LEFT JOIN streams s ON s.id = r.stream_id
       WHERE r.user_id = ?
       ORDER BY r.ran_at DESC LIMIT ? OFFSET ?`;

  const params = status ? [userId, status, limit, offset] : [userId, limit, offset];
  const { results } = await db.prepare(sql).bind(...params).all();
  return results;
}

/**
 * Get single run detail
 */
export async function getRun(db, userId, runId) {
  return db.prepare(
    `SELECT r.*, s.name as stream_name FROM run_history r
     LEFT JOIN streams s ON s.id = r.stream_id
     WHERE r.id = ? AND r.user_id = ?`
  ).bind(runId, userId).first();
}

/**
 * Delete old runs by retention days (called by cleanup job)
 */
export async function cleanupOldRuns(db, userId, retentionDays) {
  const cutoff = now() - (retentionDays * 86400);
  await db.prepare(
    'DELETE FROM run_history WHERE user_id = ? AND ran_at < ?'
  ).bind(userId, cutoff).run();
}
