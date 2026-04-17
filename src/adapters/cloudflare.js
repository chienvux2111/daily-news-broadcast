/**
 * Adapter: Cloudflare Worker
 * Deploy: wrangler deploy
 *
 * Hono-based API + channel runner cron + queue consumer
 */

import { createApp } from '../api/app.js';
import { CloudflareKVCache } from '../core/index.js';
import { defineChannels, runChannels } from '../channels/index.js';
import { KVTokenStore } from '../utils/token-store.js';
import { XOutput } from '../outputs/x.js';
import { ThreadsOutput } from '../outputs/threads.js';
import { enqueueDueStreams } from '../api/services/queue-producer.js';
import { processStreamBatch } from '../api/services/queue-consumer.js';
import { cleanupRunHistory } from '../api/services/cleanup-service.js';

const app = createApp();

export default {
  async scheduled(event, env, ctx) {
    const cron = event.cron;

    // Hourly token refresh cron
    if (cron === '0 * * * *') {
      ctx.waitUntil(refreshTokens(env));
      return;
    }

    // Every 30 min — legacy channel runner + tenant stream fan-out
    if (cron === '*/30 * * * *') {
      // Legacy single-operator channels
      const channels = defineChannels(env);
      const cache = new CloudflareKVCache(env.NEWS_CACHE);
      const now = new Date(event.scheduledTime);
      ctx.waitUntil(runChannels(channels, { cache, now }));

      // Tenant streams — enqueue due streams to CF Queue
      if (env.STREAM_QUEUE && env.DB) {
        ctx.waitUntil(enqueueDueStreams(env));
      }
      return;
    }

    // Daily cleanup cron (3 AM UTC) — delete old run history
    if (cron === '0 3 * * *' && env.DB) {
      ctx.waitUntil(cleanupRunHistory(env.DB));
      return;
    }
  },

  async fetch(request, env, ctx) {
    return app.fetch(request, env, ctx);
  },

  /** Queue consumer — processes tenant stream execution messages */
  async queue(batch, env) {
    await processStreamBatch(batch, env);
  },
};

/**
 * Unified token refresh — checks X (2h expiry) and Threads (60d expiry)
 * Runs hourly; each provider's refresh is safe to call even if token is still valid
 */
async function refreshTokens(env) {
  if (!env.TOKEN_ENCRYPTION_KEY || !env.NEWS_CACHE) return;
  const kvStore = new KVTokenStore(env.NEWS_CACHE, env.TOKEN_ENCRYPTION_KEY);

  // X OAuth 2.0 — only refresh if current access token is missing/expired
  if (env.X_CLIENT_ID) {
    try {
      const currentToken = await kvStore.getToken('x-tech-vn');
      if (!currentToken) {
        const lock = await env.NEWS_CACHE.get('refresh-lock:x-tech-vn');
        if (!lock) {
          await env.NEWS_CACHE.put('refresh-lock:x-tech-vn', '1', { expirationTtl: 120 });
          const refreshToken = await kvStore.getToken('x-tech-vn:refresh');
          if (refreshToken) {
            await XOutput.refreshToken(kvStore, 'x-tech-vn', refreshToken, env.X_CLIENT_ID);
          }
        }
      }
    } catch (err) {
      console.error(`[Refresh] X token refresh failed: ${err.message}`);
    }
  }

  // Threads — refresh long-lived token
  if (env.THREADS_USER_ID) {
    try {
      await ThreadsOutput.refreshToken(kvStore, 'threads-dev-vn');
    } catch (err) {
      console.log(`[Refresh] Threads token refresh failed: ${err.message}`);
    }
  }
}
