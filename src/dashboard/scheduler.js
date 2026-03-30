/**
 * Stream Scheduler — Manages per-stream cron jobs
 * Streams are loaded from config (read-only). Run history is kept in-memory.
 */

import cron from 'node-cron';
import { executeStream } from './stream-runner.js';

const MAX_HISTORY = 200;

/** @type {Map<string, import('node-cron').ScheduledTask>} */
const jobs = new Map();

/** @type {Set<string>} currently running stream IDs */
const running = new Set();

/** @type {object[]} in-memory run history (newest first) */
const runs = [];
let runIdCounter = 0;

/** @type {Map<string, object>} stream configs (loaded from config file) */
const streams = new Map();

/** @type {((event: object) => void)|null} */
let eventEmitter = null;

export function setEventEmitter(fn) { eventEmitter = fn; }
function emit(type, data) {
  if (eventEmitter) eventEmitter({ type, data, time: new Date().toISOString() });
}

// ============================================
// Stream access (read-only from config)
// ============================================

export function listStreams() {
  return [...streams.values()].map(s => ({
    ...s,
    is_running: running.has(s.id),
    is_scheduled: jobs.has(s.id),
    last_run: getLastRun(s.id),
  }));
}

export function getStream(id) {
  const s = streams.get(id);
  if (!s) return null;
  return {
    ...s,
    is_running: running.has(id),
    is_scheduled: jobs.has(id),
    last_run: getLastRun(id),
  };
}

// ============================================
// Run history (in-memory)
// ============================================

function addRun(streamId, triggerType) {
  const run = {
    id: ++runIdCounter,
    stream_id: streamId,
    status: 'running',
    trigger_type: triggerType,
    content: null,
    stats: null,
    ai_usage: null,
    output_results: null,
    error: null,
    started_at: new Date().toISOString(),
    finished_at: null,
  };
  runs.unshift(run);
  if (runs.length > MAX_HISTORY) runs.length = MAX_HISTORY;
  return run;
}

function completeRun(runId, result) {
  const run = runs.find(r => r.id === runId);
  if (!run) return null;
  run.status = result.status || 'success';
  run.content = result.content || null;
  run.stats = result.stats || null;
  run.ai_usage = result.aiUsage || null;
  run.output_results = result.outputs || null;
  run.error = result.error || null;
  run.finished_at = new Date().toISOString();
  return run;
}

function getLastRun(streamId) {
  return runs.find(r => r.stream_id === streamId) || null;
}

export function listRuns(streamId, limit = 20, offset = 0) {
  const filtered = runs.filter(r => r.stream_id === streamId);
  return {
    runs: filtered.slice(offset, offset + limit),
    total: filtered.length,
  };
}

export function getRun(id) {
  return runs.find(r => r.id === id) || null;
}

// ============================================
// Schedule / Run
// ============================================

function scheduleStream(stream) {
  stopStream(stream.id);
  if (!stream.enabled) return;
  if (!cron.validate(stream.cron)) {
    console.error(`[Scheduler] Invalid cron for "${stream.name}": ${stream.cron}`);
    return;
  }

  const task = cron.schedule(stream.cron, () => {
    runStream(stream.id, 'cron');
  }, { timezone: stream.timezone || 'UTC' });

  jobs.set(stream.id, task);
  console.log(`[Scheduler] "${stream.name}" -> ${stream.cron} (${stream.timezone})`);
}

function stopStream(streamId) {
  const task = jobs.get(streamId);
  if (task) { task.stop(); jobs.delete(streamId); }
}

export async function runStream(streamId, triggerType = 'manual') {
  if (running.has(streamId)) return { status: 'skipped', reason: 'already_running' };

  const stream = streams.get(streamId);
  if (!stream) return { status: 'error', error: 'Stream not found' };

  running.add(streamId);
  const run = addRun(streamId, triggerType);
  emit('run:started', { streamId, runId: run.id, trigger: triggerType });

  try {
    const result = await executeStream(stream, { force: true });
    const completed = completeRun(run.id, result);
    emit('run:completed', { streamId, runId: run.id, status: result.status, stats: result.stats });
    return completed;
  } catch (error) {
    const completed = completeRun(run.id, { status: 'error', error: error.message });
    emit('run:completed', { streamId, runId: run.id, status: 'error', error: error.message });
    return completed;
  } finally {
    running.delete(streamId);
  }
}

export async function previewStream(streamId) {
  const stream = streams.get(streamId);
  if (!stream) return { status: 'error', error: 'Stream not found' };

  const run = addRun(streamId, 'preview');
  emit('run:started', { streamId, runId: run.id, trigger: 'preview' });

  try {
    const result = await executeStream(stream, { dryRun: true, force: true });
    const completed = completeRun(run.id, { ...result, status: 'preview' });
    emit('run:completed', { streamId, runId: run.id, status: 'preview', stats: result.stats });
    return completed;
  } catch (error) {
    const completed = completeRun(run.id, { status: 'error', error: error.message });
    emit('run:completed', { streamId, runId: run.id, status: 'error', error: error.message });
    return completed;
  }
}

// ============================================
// Lifecycle
// ============================================

export function init(streamList) {
  streams.clear();
  for (const s of streamList) {
    streams.set(s.id, s);
    scheduleStream(s);
  }
  const enabled = streamList.filter(s => s.enabled).length;
  console.log(`[Scheduler] Loaded ${streamList.length} stream(s), ${enabled} active`);
}

export function isRunning(streamId) { return running.has(streamId); }

export function shutdown() {
  for (const [, task] of jobs) task.stop();
  jobs.clear();
  console.log('[Scheduler] All jobs stopped.');
}
