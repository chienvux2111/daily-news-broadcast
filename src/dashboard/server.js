#!/usr/bin/env node
/**
 * Dashboard Server — Express API + Static frontend + SSE
 * Usage: node src/dashboard/server.js
 */

import express from 'express';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as db from './database.js';
import * as scheduler from './scheduler.js';
import { getAvailablePlugins } from './stream-runner.js';

// Load .env
try { const { config } = await import('dotenv'); config(); } catch {}

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.DASHBOARD_PORT || 3000;

app.use(express.json());

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
  for (const client of sseClients) {
    client.write(data);
  }
}

// Wire scheduler events to SSE
scheduler.setEventEmitter(broadcast);

// ============================================
// API — Streams
// ============================================

app.get('/api/streams', (req, res) => {
  const streams = db.listStreams();
  // Enrich with scheduler status
  const enriched = streams.map(s => ({
    ...s,
    is_running: scheduler.isRunning(s.id),
    is_scheduled: scheduler.getScheduledIds().includes(s.id),
  }));
  res.json(enriched);
});

app.post('/api/streams', (req, res) => {
  try {
    const stream = db.createStream(req.body);
    scheduler.reschedule(stream.id);
    broadcast({ type: 'stream:created', data: stream });
    res.status(201).json(stream);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/streams/:id', (req, res) => {
  const stream = db.getStream(req.params.id);
  if (!stream) return res.status(404).json({ error: 'Not found' });
  res.json({
    ...stream,
    is_running: scheduler.isRunning(stream.id),
    is_scheduled: scheduler.getScheduledIds().includes(stream.id),
  });
});

app.put('/api/streams/:id', (req, res) => {
  const stream = db.updateStream(req.params.id, req.body);
  if (!stream) return res.status(404).json({ error: 'Not found' });
  scheduler.reschedule(stream.id);
  broadcast({ type: 'stream:updated', data: stream });
  res.json(stream);
});

app.delete('/api/streams/:id', (req, res) => {
  scheduler.remove(req.params.id);
  const deleted = db.deleteStream(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'Not found' });
  broadcast({ type: 'stream:deleted', data: { id: req.params.id } });
  res.json({ success: true });
});

app.post('/api/streams/:id/toggle', (req, res) => {
  const stream = db.toggleStream(req.params.id);
  if (!stream) return res.status(404).json({ error: 'Not found' });
  scheduler.reschedule(stream.id);
  broadcast({ type: 'stream:updated', data: stream });
  res.json(stream);
});

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
// API — Runs
// ============================================

app.get('/api/streams/:id/runs', (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  const offset = parseInt(req.query.offset) || 0;
  const result = db.listRuns(req.params.id, limit, offset);
  res.json(result);
});

app.get('/api/runs/:id', (req, res) => {
  const run = db.getRun(parseInt(req.params.id));
  if (!run) return res.status(404).json({ error: 'Not found' });
  res.json(run);
});

// ============================================
// API — Plugin Registry
// ============================================

app.get('/api/plugins', (req, res) => {
  res.json(getAvailablePlugins());
});

// ============================================
// Static frontend
// ============================================

app.use(express.static(join(__dirname, 'public')));

// SPA fallback — serve index.html for all non-API routes
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

scheduler.init();

app.listen(PORT, () => {
  console.log(`\n  Dashboard: http://localhost:${PORT}`);
  console.log(`  API:       http://localhost:${PORT}/api/streams`);
  console.log(`  Events:    http://localhost:${PORT}/api/events\n`);
});

// Graceful shutdown
const quit = () => {
  console.log('\nShutting down...');
  scheduler.shutdown();
  db.close();
  process.exit(0);
};
process.on('SIGINT', quit);
process.on('SIGTERM', quit);
