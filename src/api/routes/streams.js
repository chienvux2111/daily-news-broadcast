/**
 * Stream routes — CRUD + toggle + preview for /api/streams
 */

import { Hono } from 'hono';
import { featureGate } from '../middleware/feature-gate.js';
import { validateStreamConfig } from '../validators/stream-config.js';
import {
  listStreams, getStream, createStream, updateStream,
  deleteStream, toggleStream, countStreams,
} from '../services/stream-service.js';

const streams = new Hono();

// --- List streams (paginated) ---
streams.get('/', async (c) => {
  const user = c.get('user');
  const limit = Math.min(parseInt(c.req.query('limit')) || 20, 50);
  const offset = parseInt(c.req.query('offset')) || 0;
  const results = await listStreams(c.env.DB, user.id, { limit, offset });
  return c.json(results);
});

// --- Get single stream ---
streams.get('/:id', async (c) => {
  const user = c.get('user');
  const stream = await getStream(c.env.DB, user.id, c.req.param('id'));
  if (!stream) return c.json({ error: 'Stream not found' }, 404);
  return c.json(stream);
});

// --- Create stream (with feature gate) ---
streams.post('/',
  featureGate(async (c, limits) => {
    const user = c.get('user');
    const count = await countStreams(c.env.DB, user.id);
    if (limits.maxStreams !== -1 && count >= limits.maxStreams) {
      return { blocked: true, reason: `Plan limit: max ${limits.maxStreams} stream(s)` };
    }
    return { blocked: false };
  }),
  async (c) => {
    const user = c.get('user');
    const limits = c.get('limits');
    const body = await c.req.json();

    if (!body.name?.trim()) return c.json({ error: 'Name is required' }, 400);

    const { valid, errors } = validateStreamConfig(body.config);
    if (!valid) return c.json({ error: 'Invalid config', details: errors }, 400);

    // Check source count limit
    if (limits.maxSourcesPerStream !== -1 && body.config.sources.length > limits.maxSourcesPerStream) {
      return c.json({ error: `Plan limit: max ${limits.maxSourcesPerStream} sources per stream` }, 403);
    }

    // Check allowed outputs
    if (limits.allowedOutputs !== '*') {
      const blocked = body.config.outputs.find(o => !limits.allowedOutputs.includes(o.type));
      if (blocked) return c.json({ error: `Output "${blocked.type}" requires upgrade` }, 403);
    }

    // Check allowed AI
    if (limits.allowedAI !== '*' && !limits.allowedAI.includes(body.config.ai.provider)) {
      return c.json({ error: `AI provider "${body.config.ai.provider}" requires upgrade` }, 403);
    }

    const stream = await createStream(c.env.DB, user.id, { name: body.name.trim(), config: body.config });
    return c.json(stream, 201);
  }
);

// --- Update stream ---
streams.put('/:id',
  featureGate(async () => ({ blocked: false })),
  async (c) => {
    const user = c.get('user');
    const limits = c.get('limits');
    const body = await c.req.json();

    if (body.config) {
      const { valid, errors } = validateStreamConfig(body.config);
      if (!valid) return c.json({ error: 'Invalid config', details: errors }, 400);

      if (limits.maxSourcesPerStream !== -1 && body.config.sources.length > limits.maxSourcesPerStream) {
        return c.json({ error: `Plan limit: max ${limits.maxSourcesPerStream} sources per stream` }, 403);
      }
      if (limits.allowedOutputs !== '*') {
        const blocked = body.config.outputs.find(o => !limits.allowedOutputs.includes(o.type));
        if (blocked) return c.json({ error: `Output "${blocked.type}" requires upgrade` }, 403);
      }
      if (limits.allowedAI !== '*' && !limits.allowedAI.includes(body.config.ai.provider)) {
        return c.json({ error: `AI provider "${body.config.ai.provider}" requires upgrade` }, 403);
      }
    }

    const result = await updateStream(c.env.DB, user.id, c.req.param('id'), body);
    if (!result) return c.json({ error: 'Stream not found' }, 404);
    return c.json(result);
  }
);

// --- Delete stream ---
streams.delete('/:id', async (c) => {
  const user = c.get('user');
  const deleted = await deleteStream(c.env.DB, user.id, c.req.param('id'));
  if (!deleted) return c.json({ error: 'Stream not found' }, 404);
  return c.json({ deleted: true });
});

// --- Toggle active/inactive ---
streams.post('/:id/toggle', async (c) => {
  const user = c.get('user');
  const result = await toggleStream(c.env.DB, user.id, c.req.param('id'));
  if (!result) return c.json({ error: 'Stream not found' }, 404);
  return c.json(result);
});

// --- Preview config (dry-run without saving) ---
streams.post('/preview-config', async (c) => {
  const body = await c.req.json();
  const { valid, errors } = validateStreamConfig(body.config);
  if (!valid) return c.json({ error: 'Invalid config', details: errors }, 400);
  // Phase 04 implements actual engine execution
  return c.json({ message: 'Preview not yet implemented', config: body.config }, 501);
});

export { streams };
