/**
 * Run history routes — /api/runs and /api/streams/:streamId/runs
 */

import { Hono } from 'hono';
import { listRuns, listAllRuns, getRun } from '../services/run-history-service.js';

const runs = new Hono();

// List all runs for current user (optionally filter by status)
runs.get('/', async (c) => {
  const user = c.get('user');
  const limit = Math.min(parseInt(c.req.query('limit')) || 20, 50);
  const offset = parseInt(c.req.query('offset')) || 0;
  const status = c.req.query('status') || null;
  const results = await listAllRuns(c.env.DB, user.id, { limit, offset, status });
  return c.json(results);
});

// Get single run detail
runs.get('/:runId', async (c) => {
  const user = c.get('user');
  const run = await getRun(c.env.DB, user.id, c.req.param('runId'));
  if (!run) return c.json({ error: 'Run not found' }, 404);
  return c.json(run);
});

/** Runs scoped to a specific stream — mounted on streams routes */
const streamRuns = new Hono();

streamRuns.get('/', async (c) => {
  const user = c.get('user');
  const streamId = c.req.param('streamId');
  const limit = Math.min(parseInt(c.req.query('limit')) || 20, 50);
  const offset = parseInt(c.req.query('offset')) || 0;
  const results = await listRuns(c.env.DB, user.id, streamId, { limit, offset });
  return c.json(results);
});

export { runs, streamRuns };
