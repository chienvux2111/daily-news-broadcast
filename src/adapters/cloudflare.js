/**
 * Adapter: Cloudflare Worker
 * Deploy: wrangler deploy
 *
 * Uses channel runner — each channel is an independent engine instance
 */

import { CloudflareKVCache } from '../core/index.js';
import { buildEngine, defineChannels, runChannels } from '../channels/index.js';
import { KVTokenStore } from '../utils/token-store.js';
import { XOutput } from '../outputs/x.js';
import { ThreadsOutput } from '../outputs/threads.js';

/** Find channel by id or return first */
function findChannel(channels, id) {
  if (id) return channels.find(c => c.id === id) || null;
  return channels[0] || null;
}

export default {
  async scheduled(event, env, ctx) {
    const cron = event.cron;

    // Hourly token refresh cron — check all platform tokens
    if (cron === '0 * * * *') {
      ctx.waitUntil(refreshTokens(env));
      return;
    }

    // Channel runner cron (*/30)
    const channels = defineChannels(env);
    const cache = new CloudflareKVCache(env.NEWS_CACHE);
    const now = new Date(event.scheduledTime);
    ctx.waitUntil(runChannels(channels, { cache, now }));
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const channels = defineChannels(env);
    const cache = new CloudflareKVCache(env.NEWS_CACHE);

    if (url.pathname === '/' || url.pathname === '/health') {
      return json({
        status: 'ok',
        time: new Date().toISOString(),
        channels: channels.map(c => ({ id: c.id, mode: c.mode, schedule: c.schedule })),
      });
    }

    if (url.pathname === '/trigger' && request.method === 'POST') {
      if (env.TRIGGER_SECRET && request.headers.get('Authorization') !== `Bearer ${env.TRIGGER_SECRET}`) {
        return new Response('Unauthorized', { status: 401 });
      }
      const force = url.searchParams.get('force') === 'true';
      const channelId = url.searchParams.get('channel');

      if (channelId) {
        const ch = findChannel(channels, channelId);
        if (!ch) return json({ error: `Channel "${channelId}" not found` }, 404);
        ctx.waitUntil(runChannels([ch], { cache, now: new Date(), force }));
        return json({ message: 'Triggered', channel: channelId, force });
      }

      ctx.waitUntil(runChannels(channels, { cache, now: new Date(), force }));
      return json({ message: 'Triggered all', force, channels: channels.map(c => c.id) });
    }

    if (url.pathname === '/queue') {
      if (env.TRIGGER_SECRET && request.headers.get('Authorization') !== `Bearer ${env.TRIGGER_SECRET}`) {
        return new Response('Unauthorized', { status: 401 });
      }
      const channelId = url.searchParams.get('channel');
      const ch = findChannel(channels, channelId);
      if (!ch) return json({ error: 'No channel found' }, 404);
      const queue = await buildEngine(ch, cache).getQueue();
      return json(queue);
    }

    if (url.pathname === '/preview') {
      if (env.TRIGGER_SECRET && request.headers.get('Authorization') !== `Bearer ${env.TRIGGER_SECRET}`) {
        return new Response('Unauthorized', { status: 401 });
      }
      const channelId = url.searchParams.get('channel');
      const ch = findChannel(channels, channelId);
      if (!ch) return json({ error: 'No channel found' }, 404);
      const result = await buildEngine(ch, cache).generate();
      return json(result);
    }

    return new Response('Not found', { status: 404 });
  },
};

/**
 * Unified token refresh — checks X (2h expiry) and Threads (60d expiry)
 * Runs hourly; each provider's refresh is safe to call even if token is still valid
 */
async function refreshTokens(env) {
  if (!env.TOKEN_ENCRYPTION_KEY || !env.NEWS_CACHE) return;
  const kvStore = new KVTokenStore(env.NEWS_CACHE, env.TOKEN_ENCRYPTION_KEY);

  // X OAuth 2.0 — refresh if token exists
  if (env.X_CLIENT_ID) {
    try {
      const refreshToken = await kvStore.getToken('x-tech-vn:refresh');
      if (refreshToken) {
        await XOutput.refreshToken(kvStore, 'x-tech-vn', refreshToken, env.X_CLIENT_ID);
      }
    } catch (err) {
      console.log(`[Refresh] X token refresh failed: ${err.message}`);
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

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
