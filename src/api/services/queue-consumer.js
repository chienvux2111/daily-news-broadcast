/**
 * Queue consumer — processes stream execution messages in batches
 */

import { buildEngineFromConfig } from './stream-executor.js';
import { saveRunHistory } from './run-history-service.js';
import { getStreamRaw } from './stream-service.js';
import { nextCronOccurrence } from './cron-helper.js';

/**
 * Process a batch of queue messages — each is a stream to execute
 * @param {Object} batch - CF Queue batch { messages: [...] }
 * @param {Object} env - CF Worker env bindings
 */
export async function processStreamBatch(batch, env) {
  for (const msg of batch.messages) {
    const { streamId, userId } = msg.body;

    try {
      const stream = await getStreamRaw(env.DB, userId, streamId);
      if (!stream || !stream.active) {
        msg.ack();
        continue;
      }

      const config = stream.config;
      const engine = buildEngineFromConfig(config, env, streamId);
      const result = await engine.run();

      await saveRunHistory(env.DB, {
        userId,
        streamId,
        status: 'success',
        articlesCount: result.stats?.articles || 0,
      });

      // Update next_run_at for this stream
      const nextRun = nextCronOccurrence(config.schedule);
      if (nextRun) {
        await env.DB.prepare(
          'UPDATE streams SET next_run_at = ? WHERE id = ? AND user_id = ?'
        ).bind(nextRun, streamId, userId).run();
      }

      console.log(`[Queue] Stream ${streamId}: success (${result.stats?.articles || 0} articles)`);
      msg.ack();
    } catch (err) {
      // Sanitize error — strip secrets/tokens from message
      const safeError = err.message?.replace(/\b[A-Za-z0-9_-]{32,}\b/g, '***') || 'Unknown error';

      await saveRunHistory(env.DB, {
        userId,
        streamId,
        status: 'failed',
        error: safeError.substring(0, 500),
      });

      console.error(`[Queue] Stream ${streamId}: failed — ${safeError}`);
      msg.retry();
    }
  }
}
