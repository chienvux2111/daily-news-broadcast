/**
 * Hono app factory — main API entry point
 * Receives CF Worker env, returns configured Hono instance
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { legacy } from './routes-legacy.js';
import { getAuth } from './auth.js';
import { requireAuth } from './middleware/auth.js';
import { streams } from './routes/streams.js';
import { runs, streamRuns } from './routes/runs.js';
import { billing } from './routes/billing.js';
import { rateLimitByIP, rateLimitByUser } from './middleware/rate-limit.js';

/**
 * Create and configure the Hono app
 * @returns {Hono}
 */
export function createApp() {
  const app = new Hono();

  // --- CORS for CF Pages origin (whitelisted) ---
  app.use('/api/*', cors({
    origin: (origin, c) => {
      const appUrl = c.env?.APP_URL || 'http://localhost:8787';
      const allowed = [appUrl, 'https://newsengine.app', 'http://localhost:8787'];
      return allowed.includes(origin) ? origin : null;
    },
    credentials: true,
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  }));

  // --- Health / Legacy routes (no auth) ---
  app.get('/', (c) => c.json({ status: 'ok', time: new Date().toISOString() }));
  app.route('/', legacy);

  // --- Rate limit auth routes (60/min by IP) ---
  app.use('/api/auth/*', rateLimitByIP(60));

  // --- Better Auth routes (handles its own auth logic) ---
  app.all('/api/auth/*', (c) => {
    const auth = getAuth(c.env);
    return auth.handler(c.req.raw);
  });

  // --- Protected API routes ---
  const api = new Hono();
  api.use('*', requireAuth());
  api.use('*', rateLimitByUser(120));

  // Phase 03: Stream management
  api.route('/streams', streams);

  // Phase 04: Run history
  api.route('/runs', runs);
  api.route('/streams/:streamId/runs', streamRuns);

  // Phase 05: Billing
  api.route('/billing', billing);

  app.route('/api', api);

  // --- Global error handler ---
  app.onError((err, c) => {
    console.error(`[API] ${c.req.method} ${c.req.path}: ${err.message}`);
    return c.json({ error: 'Internal server error' }, 500);
  });

  // --- 404 fallback ---
  app.notFound((c) => c.json({ error: 'Not found' }, 404));

  return app;
}
