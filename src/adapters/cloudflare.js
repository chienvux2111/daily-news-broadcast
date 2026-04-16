/**
 * Adapter: Cloudflare Worker
 * Deploy: wrangler deploy
 *
 * Uses channel runner — each channel is an independent engine instance
 */

import { CloudflareKVCache } from '../core/index.js';
import { buildEngine, defineChannels, runChannels } from '../channels/index.js';

/** Find channel by id or return first */
function findChannel(channels, id) {
  if (id) return channels.find(c => c.id === id) || null;
  return channels[0] || null;
}

export default {
  async scheduled(event, env, ctx) {
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

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
