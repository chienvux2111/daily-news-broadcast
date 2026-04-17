/**
 * Legacy routes — migrated from cloudflare.js fetch handler
 * Preserves /trigger, /preview, /queue, /health endpoints
 */

import { Hono } from 'hono';
import { CloudflareKVCache } from '../core/index.js';
import { buildEngine, defineChannels } from '../channels/index.js';

const legacy = new Hono();

/** Find channel by id or return first */
function findChannel(channels, id) {
  if (id) return channels.find(c => c.id === id) || null;
  return channels[0] || null;
}

/** Check trigger secret authorization */
function checkTriggerAuth(c) {
  const secret = c.env.TRIGGER_SECRET;
  if (!secret) return true;
  return c.req.header('Authorization') === `Bearer ${secret}`;
}

legacy.get('/health', (c) => {
  const channels = defineChannels(c.env);
  return c.json({
    status: 'ok',
    time: new Date().toISOString(),
    channels: channels.map(ch => ({ id: ch.id, mode: ch.mode, schedule: ch.schedule })),
  });
});

legacy.post('/trigger', async (c) => {
  if (!checkTriggerAuth(c)) return c.text('Unauthorized', 401);

  const channels = defineChannels(c.env);
  const cache = new CloudflareKVCache(c.env.NEWS_CACHE);
  const force = c.req.query('force') === 'true';
  const channelId = c.req.query('channel');

  if (channelId) {
    const ch = findChannel(channels, channelId);
    if (!ch) return c.json({ error: `Channel "${channelId}" not found` }, 404);
    const { runChannels } = await import('../channels/index.js');
    c.executionCtx.waitUntil(runChannels([ch], { cache, now: new Date(), force }));
    return c.json({ message: 'Triggered', channel: channelId, force });
  }

  const { runChannels } = await import('../channels/index.js');
  c.executionCtx.waitUntil(runChannels(channels, { cache, now: new Date(), force }));
  return c.json({ message: 'Triggered all', force, channels: channels.map(ch => ch.id) });
});

legacy.get('/queue', async (c) => {
  if (!checkTriggerAuth(c)) return c.text('Unauthorized', 401);

  const channels = defineChannels(c.env);
  const cache = new CloudflareKVCache(c.env.NEWS_CACHE);
  const channelId = c.req.query('channel');
  const ch = findChannel(channels, channelId);
  if (!ch) return c.json({ error: 'No channel found' }, 404);

  const queue = await buildEngine(ch, cache).getQueue();
  return c.json(queue);
});

legacy.get('/preview', async (c) => {
  if (!checkTriggerAuth(c)) return c.text('Unauthorized', 401);

  const channels = defineChannels(c.env);
  const cache = new CloudflareKVCache(c.env.NEWS_CACHE);
  const channelId = c.req.query('channel');
  const ch = findChannel(channels, channelId);
  if (!ch) return c.json({ error: 'No channel found' }, 404);

  const result = await buildEngine(ch, cache).generate();
  return c.json(result);
});

export { legacy };
