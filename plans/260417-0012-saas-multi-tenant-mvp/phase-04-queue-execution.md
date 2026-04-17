---
phase: 04
title: "Queue-Based Stream Execution"
status: complete
priority: P1
effort: 2d
---

# Phase 04: Queue-Based Stream Execution

## Context Links
- Parent: [plan.md](./plan.md)
- Research: [Infra Architecture — Queues](./research/researcher-02-infra-architecture.md#topic-2)
- Depends on: Phase 01 (D1 + Queues binding), Phase 03 (Stream CRUD)
- Blocks: Phase 07

## Overview
CF Queues fan-out for multi-tenant stream execution. Cron trigger queries active streams from D1, enqueues one message per stream. Queue consumer loads stream config, builds NewsEngine instance, runs pipeline, saves result to run_history. Run history API + UI for users to see execution logs.

## Key Insights
- At-least-once delivery — engine's cache dedup makes `runStream()` idempotent
- 30s CPU limit per queue invocation on paid plan — must monitor execution time
- `max_batch_size: 10` = 10 streams processed per invocation; CF auto-scales invocations
- `max_retries: 3` with DLQ — failed streams don't block others
- Existing `buildEngine()` from `src/channels/runner.js` maps channel config → NewsEngine; tenant stream config uses same pattern
- Cron trigger replaces current `*/30` channel runner with tenant-aware fan-out

## Requirements

### Functional
- Cron trigger enqueues all active streams as individual queue messages
- Queue consumer: load config from D1 → build engine → run → save run_history
- Run history API: list runs by stream, get single run details
- Run history UI: table per stream showing recent runs with status, article count, timestamp
- DLQ for permanently failed messages

### Non-Functional
- Single stream execution < 25s (buffer for 30s CPU limit)
- Queue fan-out for 100 streams < 1s (single sendBatch call)
- Run history retention: 7d (free), 30d (pro), 90d (business) — enforced by cleanup job

## Architecture

### Execution Flow
```
Cron (every 30 min)
  │
  ├─ SELECT id, user_id FROM streams WHERE active = 1
  │   AND schedule matches current time window
  │
  ├─ env.STREAM_QUEUE.sendBatch([
  │    { body: { streamId, userId } },
  │    ...
  │  ])
  │
  └─ Done (cron handler exits fast)

Queue Consumer (batch of 10)
  │
  for each message:
  ├─ Load stream config from D1
  ├─ Load user subscription (for AI model access)
  ├─ Build NewsEngine instance from config
  │   ├─ Create source plugins from config.sources
  │   ├─ Create AI plugin from config.ai
  │   ├─ Create output plugins from config.outputs
  │   └─ Set cache (CloudflareKVCache, keyed by stream.id)
  ├─ engine.run()
  ├─ INSERT INTO run_history (status, articles_count, ran_at)
  ├─ msg.ack()
  │
  on error:
  ├─ INSERT INTO run_history (status='failed', error=message)
  └─ msg.retry()
```

### Schedule Matching Logic
- Each stream has a cron expression in config (e.g., `0 7 * * *`)
- Cron trigger runs every 30 min — need to check if stream's schedule falls within current 30-min window
- Simple approach: parse cron hour/minute, check if `now` is within +-15 min of scheduled time
- Alternative: store `next_run_at` INTEGER in streams table, query `WHERE next_run_at <= now`, update after run
- **Decision: `next_run_at` approach** — simpler query, no cron parsing in hot path

## Related Code Files

### Create
- `src/api/services/queue-producer.js` — cron handler: query active streams, enqueue
- `src/api/services/queue-consumer.js` — process queue message: load config, build engine, run, save history
- `src/api/services/stream-executor.js` — build NewsEngine from stream config JSON (maps config → plugin instances)
- `src/api/services/run-history-service.js` — CRUD for run_history table
- `src/api/routes/runs.js` — Hono routes for run history API
- `src/dashboard/public/pages/runs.js` — run history UI component
- `migrations/0003_add_next_run_at.sql` — add `next_run_at` column to streams

### Modify
- `src/adapters/cloudflare.js` — implement `queue()` handler, update `scheduled()` to call queue producer
- `src/api/app.js` — mount run routes
- `wrangler.toml` — verify queue bindings (should exist from Phase 01)

### Keep
- All `src/core/*`, `src/sources/*`, `src/ai/*`, `src/outputs/*` — imported but never modified

## Implementation Steps

### 1. Add `next_run_at` to streams (`migrations/0003_add_next_run_at.sql`)
```sql
ALTER TABLE streams ADD COLUMN next_run_at INTEGER;
-- Backfill: set to now for all active streams so they run on next cron
UPDATE streams SET next_run_at = unixepoch() WHERE active = 1;
CREATE INDEX idx_streams_next_run ON streams(next_run_at) WHERE active = 1;
```

### 2. Create stream executor (`src/api/services/stream-executor.js`)
Core function: `buildEngineFromConfig(streamConfig, env)` → NewsEngine instance
- Map `config.sources[]` → source plugin instances (RSSSource, HackerNewsSource, etc.)
- Map `config.ai` → AI plugin instance via `createAI()` from `src/ai/create-ai.js`
- Map `config.outputs[]` → output plugin instances (TelegramOutput, DiscordOutput, etc.)
- Set cache: `new CloudflareKVCache(env.NEWS_CACHE)` with stream-specific key prefix
- Return configured engine ready to `.run()`

### 3. Create queue producer (`src/api/services/queue-producer.js`)
```js
export async function enqueueDueStreams(env) {
  const now = Math.floor(Date.now() / 1000);
  const streams = await env.DB.prepare(
    'SELECT id, user_id FROM streams WHERE active = 1 AND next_run_at <= ?'
  ).bind(now).all();

  if (!streams.results.length) return 0;

  await env.STREAM_QUEUE.sendBatch(
    streams.results.map(s => ({ body: { streamId: s.id, userId: s.user_id } }))
  );
  return streams.results.length;
}
```

### 4. Create queue consumer (`src/api/services/queue-consumer.js`)
```js
export async function processStreamBatch(batch, env) {
  for (const msg of batch.messages) {
    const { streamId, userId } = msg.body;
    try {
      const stream = await getStream(env.DB, userId, streamId);
      if (!stream || !stream.active) { msg.ack(); continue; }

      const config = JSON.parse(stream.config);
      const engine = buildEngineFromConfig(config, env);
      const result = await engine.run();

      await saveRunHistory(env.DB, {
        userId, streamId, status: 'success',
        articlesCount: result.articles?.length || 0,
      });

      // Update next_run_at based on stream's cron schedule
      await updateNextRunAt(env.DB, streamId, config.schedule);

      msg.ack();
    } catch (err) {
      await saveRunHistory(env.DB, {
        userId, streamId, status: 'failed', error: err.message,
      });
      msg.retry();
    }
  }
}
```

### 5. Create run history service (`src/api/services/run-history-service.js`)
- `saveRunHistory(db, { userId, streamId, status, articlesCount, error })`
- `listRuns(db, userId, streamId, { limit, offset })`
- `getRun(db, userId, runId)`
- `cleanupOldRuns(db, userId, retentionDays)` — delete runs older than tier allows

### 6. Create run history routes (`src/api/routes/runs.js`)
```
GET /api/streams/:streamId/runs         → paginated run list
GET /api/runs/:runId                    → single run detail
```

### 7. Update `src/adapters/cloudflare.js`
```js
// In scheduled():
if (cron === '*/30 * * * *') {
  ctx.waitUntil(enqueueDueStreams(env));
  return;
}
// Keep hourly token refresh

// Add queue() handler:
async queue(batch, env) {
  await processStreamBatch(batch, env);
}
```

### 8. Create run history UI (`src/dashboard/public/pages/runs.js`)
- Table: timestamp, status (success/failed badge), article count, error message (if failed)
- Auto-refresh via polling every 30s
- Filter by stream (if viewing from dashboard home)
- Link from stream card to its run history

### 9. Implement `updateNextRunAt` helper
- Parse cron expression to find next occurrence after now
- Lightweight cron parser: handle common patterns (daily, 2x/day, custom hour/min)
- Store as Unix timestamp in `next_run_at`

### 10. Test
```bash
# Manual trigger via queue
wrangler dev
# Insert test stream in D1
# Trigger cron manually: curl -X POST /trigger
# Check run_history table
# Check output channel received content
```

## Todo List
- [ ] Create migration: add `next_run_at` column to streams
- [ ] Apply migration locally + remotely
- [ ] Create `src/api/services/stream-executor.js` — config → engine builder
- [ ] Create `src/api/services/queue-producer.js` — cron fan-out
- [ ] Create `src/api/services/queue-consumer.js` — batch processor
- [ ] Create `src/api/services/run-history-service.js` — CRUD
- [ ] Create `src/api/routes/runs.js` — run history API
- [ ] Update `src/adapters/cloudflare.js` — scheduled() + queue() handlers
- [ ] Create run history UI page
- [ ] Implement `updateNextRunAt` cron helper
- [ ] Test: cron enqueues active streams
- [ ] Test: queue consumer runs engine and saves history
- [ ] Test: failed stream retries up to 3x then hits DLQ
- [ ] Test: run history API returns correct data

## Success Criteria
- Cron trigger queries D1 and enqueues only due streams
- Queue consumer processes each message independently (one failure doesn't block batch)
- Run history saved for both success and failure cases
- Run history API returns paginated results scoped to authenticated user
- Engine execution uses correct source/AI/output plugins from config
- `next_run_at` updated after each run to correct next occurrence

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Stream execution exceeds 30s CPU limit | Medium | High | Cap maxArticles, limit sources/stream by tier, add timeout wrapper |
| Cron parsing edge cases | Medium | Medium | Support common patterns only; complex cron → use library later |
| Queue message lost (at-least-once, not exactly-once) | Low | Low | Engine dedup cache prevents duplicate sends |
| D1 write contention during batch processing | Low | Medium | Each message writes different rows; D1 handles serial writes |

## Security Considerations
- Queue consumer loads stream config containing output secrets — stays server-side, never returned to client
- Run history error messages may contain sensitive info — sanitize before storing (strip tokens/URLs)
- Queue messages contain only streamId + userId — no secrets in transit
- Consumer validates stream belongs to userId before processing

## Next Steps
- Phase 07 adds run history cleanup job (retention by tier)
- Phase 07 adds monitoring and error alerting
