/**
 * Dashboard Database — SQLite via better-sqlite3
 * Stores stream configs and run history
 */

import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { join, dirname } from 'path';
import { mkdirSync } from 'fs';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '../../.data/dashboard.db');

// Ensure directory exists
mkdirSync(dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ============================================
// Migrations
// ============================================

db.exec(`
  CREATE TABLE IF NOT EXISTS streams (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    enabled INTEGER DEFAULT 1,
    cron TEXT NOT NULL,
    timezone TEXT DEFAULT 'UTC',
    sources TEXT NOT NULL,
    ai TEXT,
    outputs TEXT NOT NULL,
    options TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stream_id TEXT NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    trigger_type TEXT DEFAULT 'cron',
    content TEXT,
    stats TEXT,
    ai_usage TEXT,
    output_results TEXT,
    error TEXT,
    started_at TEXT DEFAULT (datetime('now')),
    finished_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_runs_stream ON runs(stream_id, started_at DESC);
`);

// ============================================
// Stream CRUD
// ============================================

const stmts = {
  listStreams: db.prepare(`
    SELECT s.*,
      (SELECT json_object('id', r.id, 'status', r.status, 'started_at', r.started_at, 'finished_at', r.finished_at, 'stats', r.stats)
       FROM runs r WHERE r.stream_id = s.id ORDER BY r.started_at DESC LIMIT 1) as last_run
    FROM streams s ORDER BY s.created_at DESC
  `),
  getStream: db.prepare('SELECT * FROM streams WHERE id = ?'),
  insertStream: db.prepare(`
    INSERT INTO streams (id, name, enabled, cron, timezone, sources, ai, outputs, options)
    VALUES (@id, @name, @enabled, @cron, @timezone, @sources, @ai, @outputs, @options)
  `),
  updateStream: db.prepare(`
    UPDATE streams SET name=@name, enabled=@enabled, cron=@cron, timezone=@timezone,
    sources=@sources, ai=@ai, outputs=@outputs, options=@options, updated_at=datetime('now')
    WHERE id=@id
  `),
  deleteStream: db.prepare('DELETE FROM streams WHERE id = ?'),
  toggleStream: db.prepare('UPDATE streams SET enabled = NOT enabled, updated_at = datetime(\'now\') WHERE id = ?'),

  // Runs
  insertRun: db.prepare(`
    INSERT INTO runs (stream_id, status, trigger_type)
    VALUES (@stream_id, @status, @trigger_type)
  `),
  updateRun: db.prepare(`
    UPDATE runs SET status=@status, content=@content, stats=@stats, ai_usage=@ai_usage,
    output_results=@output_results, error=@error, finished_at=datetime('now')
    WHERE id=@id
  `),
  listRuns: db.prepare(`
    SELECT * FROM runs WHERE stream_id = ? ORDER BY started_at DESC LIMIT ? OFFSET ?
  `),
  getRun: db.prepare('SELECT * FROM runs WHERE id = ?'),
  countRuns: db.prepare('SELECT COUNT(*) as count FROM runs WHERE stream_id = ?'),
};

function parseStream(row) {
  if (!row) return null;
  return {
    ...row,
    enabled: !!row.enabled,
    sources: JSON.parse(row.sources),
    ai: row.ai ? JSON.parse(row.ai) : null,
    outputs: JSON.parse(row.outputs),
    options: row.options ? JSON.parse(row.options) : {},
    last_run: row.last_run ? JSON.parse(row.last_run) : null,
  };
}

function parseRun(row) {
  if (!row) return null;
  return {
    ...row,
    stats: row.stats ? JSON.parse(row.stats) : null,
    ai_usage: row.ai_usage ? JSON.parse(row.ai_usage) : null,
    output_results: row.output_results ? JSON.parse(row.output_results) : null,
  };
}

export function listStreams() {
  return stmts.listStreams.all().map(parseStream);
}

export function getStream(id) {
  return parseStream(stmts.getStream.get(id));
}

export function createStream(data) {
  const id = randomUUID();
  stmts.insertStream.run({
    id,
    name: data.name,
    enabled: data.enabled !== false ? 1 : 0,
    cron: data.cron,
    timezone: data.timezone || 'UTC',
    sources: JSON.stringify(data.sources),
    ai: data.ai ? JSON.stringify(data.ai) : null,
    outputs: JSON.stringify(data.outputs),
    options: data.options ? JSON.stringify(data.options) : null,
  });
  return getStream(id);
}

export function updateStream(id, data) {
  const existing = stmts.getStream.get(id);
  if (!existing) return null;
  stmts.updateStream.run({
    id,
    name: data.name ?? existing.name,
    enabled: data.enabled !== undefined ? (data.enabled ? 1 : 0) : existing.enabled,
    cron: data.cron ?? existing.cron,
    timezone: data.timezone ?? existing.timezone,
    sources: data.sources ? JSON.stringify(data.sources) : existing.sources,
    ai: data.ai !== undefined ? (data.ai ? JSON.stringify(data.ai) : null) : existing.ai,
    outputs: data.outputs ? JSON.stringify(data.outputs) : existing.outputs,
    options: data.options !== undefined ? JSON.stringify(data.options) : existing.options,
  });
  return getStream(id);
}

export function deleteStream(id) {
  const result = stmts.deleteStream.run(id);
  return result.changes > 0;
}

export function toggleStream(id) {
  stmts.toggleStream.run(id);
  return getStream(id);
}

// ============================================
// Run CRUD
// ============================================

export function createRun(streamId, triggerType = 'cron') {
  const info = stmts.insertRun.run({
    stream_id: streamId,
    status: 'running',
    trigger_type: triggerType,
  });
  return parseRun(stmts.getRun.get(info.lastInsertRowid));
}

export function completeRun(runId, result) {
  stmts.updateRun.run({
    id: runId,
    status: result.status || 'success',
    content: result.content || null,
    stats: result.stats ? JSON.stringify(result.stats) : null,
    ai_usage: result.aiUsage ? JSON.stringify(result.aiUsage) : null,
    output_results: result.outputs ? JSON.stringify(result.outputs) : null,
    error: result.error || null,
  });
  return parseRun(stmts.getRun.get(runId));
}

export function listRuns(streamId, limit = 20, offset = 0) {
  const runs = stmts.listRuns.all(streamId, limit, offset).map(parseRun);
  const { count } = stmts.countRuns.get(streamId);
  return { runs, total: count };
}

export function getRun(id) {
  return parseRun(stmts.getRun.get(id));
}

export function close() {
  db.close();
}
