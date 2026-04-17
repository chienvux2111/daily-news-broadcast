/**
 * Queue producer — cron handler that enqueues due streams
 */

/**
 * Query active streams whose next_run_at <= now, enqueue each as a queue message
 * @param {Object} env - CF Worker env (DB + STREAM_QUEUE bindings)
 * @returns {Promise<number>} count of enqueued streams
 */
export async function enqueueDueStreams(env) {
  const ts = Math.floor(Date.now() / 1000);
  const { results } = await env.DB.prepare(
    'SELECT id, user_id FROM streams WHERE active = 1 AND next_run_at <= ?'
  ).bind(ts).all();

  if (!results.length) {
    console.log('[Queue] No due streams');
    return 0;
  }

  // CF Queue sendBatch max 100 messages per call
  const messages = results.map(s => ({ body: { streamId: s.id, userId: s.user_id } }));
  for (let i = 0; i < messages.length; i += 100) {
    await env.STREAM_QUEUE.sendBatch(messages.slice(i, i + 100));
  }

  console.log(`[Queue] Enqueued ${results.length} stream(s)`);
  return results.length;
}
