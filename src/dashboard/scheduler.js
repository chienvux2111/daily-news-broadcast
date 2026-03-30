/**
 * Stream Scheduler — Manages per-stream cron jobs
 * Uses node-cron to schedule independent jobs for each enabled stream.
 */

import cron from 'node-cron';
import * as db from './database.js';
import { executeStream } from './stream-runner.js';

/** @type {Map<string, import('node-cron').ScheduledTask>} */
const jobs = new Map();

/** @type {Set<string>} currently running stream IDs */
const running = new Set();

/** @type {((event: object) => void)|null} */
let eventEmitter = null;

export function setEventEmitter(fn) {
  eventEmitter = fn;
}

function emit(type, data) {
  if (eventEmitter) eventEmitter({ type, data, time: new Date().toISOString() });
}

// ============================================
// Schedule a single stream
// ============================================

function scheduleStream(stream) {
  // Stop existing job if any
  stopStream(stream.id);

  if (!stream.enabled) return;
  if (!cron.validate(stream.cron)) {
    console.error(`[Scheduler] Invalid cron for stream "${stream.name}": ${stream.cron}`);
    return;
  }

  const task = cron.schedule(stream.cron, () => {
    runStream(stream.id, 'cron');
  }, { timezone: stream.timezone || 'UTC' });

  jobs.set(stream.id, task);
  console.log(`[Scheduler] Scheduled "${stream.name}" → ${stream.cron} (${stream.timezone})`);
}

function stopStream(streamId) {
  const existing = jobs.get(streamId);
  if (existing) {
    existing.stop();
    jobs.delete(streamId);
  }
}

// ============================================
// Execute a stream run
// ============================================

export async function runStream(streamId, triggerType = 'manual') {
  if (running.has(streamId)) {
    return { status: 'skipped', reason: 'already_running' };
  }

  const stream = db.getStream(streamId);
  if (!stream) return { status: 'error', error: 'Stream not found' };

  running.add(streamId);
  const run = db.createRun(streamId, triggerType);
  emit('run:started', { streamId, runId: run.id, trigger: triggerType });

  try {
    const result = await executeStream(stream, { force: true });
    const completed = db.completeRun(run.id, result);
    emit('run:completed', { streamId, runId: run.id, status: result.status, stats: result.stats });
    return completed;
  } catch (error) {
    const completed = db.completeRun(run.id, { status: 'error', error: error.message });
    emit('run:completed', { streamId, runId: run.id, status: 'error', error: error.message });
    return completed;
  } finally {
    running.delete(streamId);
  }
}

export async function previewStream(streamId) {
  const stream = db.getStream(streamId);
  if (!stream) return { status: 'error', error: 'Stream not found' };

  const run = db.createRun(streamId, 'preview');
  emit('run:started', { streamId, runId: run.id, trigger: 'preview' });

  try {
    const result = await executeStream(stream, { dryRun: true, force: true });
    const completed = db.completeRun(run.id, { ...result, status: 'preview' });
    emit('run:completed', { streamId, runId: run.id, status: 'preview', stats: result.stats });
    return completed;
  } catch (error) {
    const completed = db.completeRun(run.id, { status: 'error', error: error.message });
    emit('run:completed', { streamId, runId: run.id, status: 'error', error: error.message });
    return completed;
  }
}

// ============================================
// Lifecycle
// ============================================

export function init() {
  const streams = db.listStreams();
  console.log(`[Scheduler] Loading ${streams.length} stream(s)...`);
  for (const stream of streams) {
    scheduleStream(stream);
  }
}

export function reschedule(streamId) {
  const stream = db.getStream(streamId);
  if (stream) {
    scheduleStream(stream);
  } else {
    stopStream(streamId);
  }
}

export function remove(streamId) {
  stopStream(streamId);
}

export function isRunning(streamId) {
  return running.has(streamId);
}

export function getScheduledIds() {
  return [...jobs.keys()];
}

export function shutdown() {
  for (const [id, task] of jobs) {
    task.stop();
  }
  jobs.clear();
  console.log('[Scheduler] All jobs stopped.');
}
