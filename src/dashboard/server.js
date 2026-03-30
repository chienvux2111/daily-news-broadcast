#!/usr/bin/env node
/**
 * Dashboard Server — Config-driven, monitor-only UI
 *
 * Reads streams from streams.config.json, schedules cron jobs,
 * serves a read-only dashboard for monitoring and manual triggers.
 *
 * Usage:
 *   node src/dashboard/server.js [path/to/streams.config.json]
 */

import express from 'express';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadConfig } from './config-loader.js';
import * as scheduler from './scheduler.js';

// Load .env
try { const { config } = await import('dotenv'); config(); } catch {}

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.DASHBOARD_PORT || 3000;

// Load config
const configPath = process.argv[2] || undefined;
const { streams, configPath: resolvedPath } = loadConfig(configPath);
console.log(`[Config] Loaded from ${resolvedPath}`);

// ============================================
// SSE — Server-Sent Events
// ============================================

const sseClients = new Set();

app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write('data: {"type":"connected"}\n\n');
  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

function broadcast(event) {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of sseClients) client.write(data);
}

scheduler.setEventEmitter(broadcast);

// ============================================
// API — Streams (read-only)
// ============================================

app.get('/api/streams', (req, res) => {
  res.json(scheduler.listStreams());
});

app.get('/api/streams/:id', (req, res) => {
  const stream = scheduler.getStream(req.params.id);
  if (!stream) return res.status(404).json({ error: 'Not found' });
  res.json(stream);
});

// ============================================
// API — Trigger / Preview
// ============================================

app.post('/api/streams/:id/run', async (req, res) => {
  try {
    const result = await scheduler.runStream(req.params.id, 'manual');
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/streams/:id/preview', async (req, res) => {
  try {
    const result = await scheduler.previewStream(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// API — Runs (in-memory history)
// ============================================

app.get('/api/streams/:id/runs', (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  const offset = parseInt(req.query.offset) || 0;
  res.json(scheduler.listRuns(req.params.id, limit, offset));
});

app.get('/api/runs/:id', (req, res) => {
  const run = scheduler.getRun(parseInt(req.params.id));
  if (!run) return res.status(404).json({ error: 'Not found' });
  res.json(run);
});

// ============================================
// Static frontend
// ============================================

app.use(express.static(join(__dirname, 'public')));

app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api/')) {
    res.sendFile(join(__dirname, 'public', 'index.html'));
  } else {
    next();
  }
});

// ============================================
// Start
// ============================================

scheduler.init(streams);

app.listen(PORT, () => {
  console.log(`\n  Dashboard: http://localhost:${PORT}\n`);
});

const quit = () => { scheduler.shutdown(); process.exit(0); };
process.on('SIGINT', quit);
process.on('SIGTERM', quit);
