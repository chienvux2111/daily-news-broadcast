/**
 * Stream service — D1 CRUD operations for streams table
 * All queries include user_id scoping for tenant isolation
 */

/** Mask sensitive fields in config (bot tokens, webhook URLs) */
function maskSecrets(config) {
  if (!config) return config;
  const masked = JSON.parse(JSON.stringify(config));
  if (Array.isArray(masked.outputs)) {
    for (const out of masked.outputs) {
      if (out.botToken) out.botToken = '***' + out.botToken.slice(-4);
      if (out.webhookUrl) out.webhookUrl = '***' + out.webhookUrl.slice(-4);
      if (out.accessToken) out.accessToken = '***' + out.accessToken.slice(-4);
    }
  }
  return masked;
}

import { nextCronOccurrence } from './cron-helper.js';

/** Generate a short UUID */
function uuid() {
  return crypto.randomUUID();
}

/** Current Unix epoch seconds */
function now() {
  return Math.floor(Date.now() / 1000);
}

export async function listStreams(db, userId, { limit = 20, offset = 0 } = {}) {
  const { results } = await db.prepare(
    'SELECT * FROM streams WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
  ).bind(userId, limit, offset).all();

  return results.map(s => ({
    ...s,
    config: maskSecrets(JSON.parse(s.config)),
  }));
}

export async function getStream(db, userId, streamId) {
  const row = await db.prepare(
    'SELECT * FROM streams WHERE id = ? AND user_id = ?'
  ).bind(streamId, userId).first();

  if (!row) return null;
  return { ...row, config: maskSecrets(JSON.parse(row.config)) };
}

/** Get raw stream (with unmasked secrets) — for internal use only */
export async function getStreamRaw(db, userId, streamId) {
  const row = await db.prepare(
    'SELECT * FROM streams WHERE id = ? AND user_id = ?'
  ).bind(streamId, userId).first();

  if (!row) return null;
  return { ...row, config: JSON.parse(row.config) };
}

export async function createStream(db, userId, { name, config }) {
  const id = uuid();
  const ts = now();
  const nextRun = nextCronOccurrence(config.schedule) || ts;
  await db.prepare(
    `INSERT INTO streams (id, user_id, name, config, active, next_run_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, 1, ?, ?, ?)`
  ).bind(id, userId, name, JSON.stringify(config), nextRun, ts, ts).run();
  return { id, user_id: userId, name, config: maskSecrets(config), active: 1, next_run_at: nextRun, created_at: ts, updated_at: ts };
}

export async function updateStream(db, userId, streamId, updates) {
  const existing = await db.prepare(
    'SELECT * FROM streams WHERE id = ? AND user_id = ?'
  ).bind(streamId, userId).first();
  if (!existing) return null;

  const name = updates.name ?? existing.name;
  const config = updates.config ? JSON.stringify(updates.config) : existing.config;
  const active = updates.active !== undefined ? (updates.active ? 1 : 0) : existing.active;
  const ts = now();

  // Recompute next_run_at if schedule changed
  let nextRun = existing.next_run_at;
  if (updates.config?.schedule) {
    nextRun = nextCronOccurrence(updates.config.schedule) || ts;
  }

  await db.prepare(
    'UPDATE streams SET name = ?, config = ?, active = ?, next_run_at = ?, updated_at = ? WHERE id = ? AND user_id = ?'
  ).bind(name, config, active, nextRun, ts, streamId, userId).run();

  return { id: streamId, user_id: userId, name, config: maskSecrets(updates.config || JSON.parse(existing.config)), active, updated_at: ts };
}

export async function deleteStream(db, userId, streamId) {
  const { meta } = await db.prepare(
    'DELETE FROM streams WHERE id = ? AND user_id = ?'
  ).bind(streamId, userId).run();
  return meta.changes > 0;
}

export async function toggleStream(db, userId, streamId) {
  const row = await db.prepare(
    'SELECT active FROM streams WHERE id = ? AND user_id = ?'
  ).bind(streamId, userId).first();
  if (!row) return null;

  const newActive = row.active ? 0 : 1;
  const ts = now();
  await db.prepare(
    'UPDATE streams SET active = ?, updated_at = ? WHERE id = ? AND user_id = ?'
  ).bind(newActive, ts, streamId, userId).run();
  return { active: newActive };
}

export async function countStreams(db, userId) {
  const row = await db.prepare(
    'SELECT COUNT(*) as count FROM streams WHERE user_id = ?'
  ).bind(userId).first();
  return row?.count || 0;
}
