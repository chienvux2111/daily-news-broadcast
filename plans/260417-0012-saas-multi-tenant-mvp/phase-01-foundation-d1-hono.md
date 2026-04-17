---
phase: 01
title: "Foundation — D1 Schema + Hono Migration"
status: complete
priority: P1
effort: 3d
---

# Phase 01: Foundation — D1 Schema + Hono Migration

## Context Links
- Parent: [plan.md](./plan.md)
- Research: [Infra Architecture](./research/researcher-02-infra-architecture.md)
- Blocks: Phase 02, 03, 04

## Overview
Replace Express with Hono in CF Worker. Create D1 database with migration SQL for all tenant tables. Update wrangler.toml with D1 + Queue bindings. This is the foundation everything else builds on.

## Key Insights
- Express uses `require('http')` — incompatible with CF Workers V8 isolates
- Hono is 12KB, Express-like API, CF's officially recommended framework
- Migration from Express is near-mechanical: `app.get` -> `app.get`, same signatures
- D1 does NOT enable foreign keys by default — must `PRAGMA foreign_keys = ON` per connection
- D1 has no down-migrations — write forward-only SQL
- Single shared DB with `user_id` FK (not per-tenant DB) — correct for MVP scale

## Requirements

### Functional
- D1 database created via wrangler CLI
- Migration SQL creates all tables: Better Auth tables + streams + run_history
- Hono app serves `/api/*` routes and falls back to SPA for other paths
- Existing `/trigger`, `/preview`, `/queue`, `/health` endpoints preserved behind Hono
- wrangler.toml updated with D1, Queue producer/consumer bindings

### Non-Functional
- Hono bundle adds <15KB to worker
- All existing cron + fetch functionality continues working
- Local dev via `wrangler dev` still works

## Architecture

```
CF Worker (Hono)
  ├── GET  /                    → health/status JSON
  ├── GET  /api/*               → tenant API routes (phases 02-05)
  ├── POST /trigger             → legacy trigger (keep for backward compat)
  ├── GET  /preview             → legacy preview
  └── *                         → 404

D1 "newsengine-db"
  ├── user, session, account, verification  (Better Auth)
  ├── polar_customer, polar_subscription     (Polar plugin)
  ├── streams                                (tenant configs)
  └── run_history                            (execution logs)
```

## Related Code Files

### Modify
- `wrangler.toml` — add D1 binding, Queue bindings, update cron
- `src/adapters/cloudflare.js` — rewrite: Express-incompatible → Hono app
- `package.json` — add `hono` dependency

### Create
- `migrations/0001_initial_schema.sql` — all tables
- `src/api/app.js` — Hono app factory (receives env, returns Hono instance)
- `src/api/routes-legacy.js` — migrated /trigger, /preview, /queue, /health routes
- `src/api/middleware/db.js` — D1 helper: auto-enables foreign keys, tenant-scoped query wrapper

### Keep (no changes)
- `src/core/*`, `src/sources/*`, `src/ai/*`, `src/outputs/*`
- `src/channels/*` — existing channel definitions still used by legacy routes
- `src/dashboard/server.js` — kept for local Node.js dev (not deployed to CF)

## Implementation Steps

### 1. Create D1 database
```bash
wrangler d1 create newsengine-db
```
Copy the database_id into wrangler.toml.

### 2. Write migration SQL (`migrations/0001_initial_schema.sql`)
Tables (all with INTEGER timestamps, TEXT PKs):

**Better Auth tables** (will be refined by `npx better-auth generate`, but scaffold now):
- `user` — id, name, email, emailVerified, image, createdAt, updatedAt
- `session` — id, userId, token, expiresAt, ipAddress, userAgent
- `account` — id, userId, accountId, providerId, accessToken, refreshToken, expiresAt
- `verification` — id, identifier, value, expiresAt

**Polar plugin tables:**
- `polar_customer` — id, userId, polarCustomerId, createdAt
- `polar_subscription` — id, polarCustomerId, productId, status, currentPeriodEnd, canceledAt

**App tables:**
- `streams` — id, user_id, name, config (JSON TEXT), active, created_at, updated_at
- `run_history` — id, user_id, stream_id, status, articles_count, error, ran_at

Indexes: user email, streams by user_id, streams active, run_history by stream_id+ran_at, run_history by user_id+ran_at.

### 3. Apply migration
```bash
wrangler d1 migrations apply newsengine-db        # local
wrangler d1 migrations apply newsengine-db --remote  # prod
```

### 4. Update wrangler.toml
```toml
[[d1_databases]]
binding = "DB"
database_name = "newsengine-db"
database_id = "<from step 1>"
migrations_dir = "migrations"

[[queues.producers]]
binding = "STREAM_QUEUE"
queue = "newsengine-stream-jobs"

[[queues.consumers]]
queue = "newsengine-stream-jobs"
max_batch_size = 10
max_batch_timeout = 30
max_retries = 3
dead_letter_queue = "newsengine-stream-jobs-dlq"
```

### 5. Install Hono
```bash
npm install hono
```

### 6. Create `src/api/middleware/db.js`
- Export `createDB(env)` — wraps `env.DB` with:
  - Auto `PRAGMA foreign_keys = ON` on first use
  - `db.queryForUser(userId, sql, params)` — injects `WHERE user_id = ?` safety check (logs warning if user_id not in query)
- Keep it thin (<60 lines)

### 7. Create `src/api/app.js`
- Hono app factory function: `createApp(env)` returns configured Hono instance
- Mount route groups: `/api/auth/*`, `/api/streams/*`, `/api/runs/*`, `/api/billing/*`
- CORS middleware for CF Pages origin
- Error handler middleware (catch-all → JSON error response)
- Stub route groups with 501 "Not implemented" for phases 02-05

### 8. Create `src/api/routes-legacy.js`
- Migrate existing `/trigger`, `/preview`, `/queue`, `/health` from cloudflare.js
- Same logic, Hono context (`c.env`, `c.json()`, `c.req.query()`)

### 9. Rewrite `src/adapters/cloudflare.js`
- Import Hono app from `src/api/app.js`
- `fetch()` handler → delegate to Hono app
- `scheduled()` handler → keep existing channel runner logic (unchanged)
- `queue()` handler → stub for Phase 04
- Keep `refreshTokens()` function unchanged

### 10. Verify
```bash
wrangler dev  # local test
curl http://localhost:8787/health
curl -X POST http://localhost:8787/trigger
```

## Todo List
- [ ] Create D1 database via wrangler CLI
- [ ] Write migration SQL (all tables + indexes)
- [ ] Run `npx better-auth generate` to confirm auth table schema
- [ ] Apply migration locally + remotely
- [ ] Update wrangler.toml (D1, Queues, DLQ)
- [ ] Install hono
- [ ] Create `src/api/middleware/db.js` — D1 wrapper with FK enforcement
- [ ] Create `src/api/app.js` — Hono app factory with route stubs
- [ ] Create `src/api/routes-legacy.js` — migrated legacy endpoints
- [ ] Rewrite `src/adapters/cloudflare.js` — Hono + scheduled + queue stub
- [ ] Test: `wrangler dev` → health, trigger, preview all work
- [ ] Test: D1 tables created, queryable

## Success Criteria
- `wrangler dev` starts without errors
- `/health` returns JSON with status ok
- `/trigger` and `/preview` work same as before
- D1 tables visible via `wrangler d1 execute newsengine-db --command "SELECT name FROM sqlite_master WHERE type='table'"`
- No changes to `src/core/*`, `src/sources/*`, `src/ai/*`, `src/outputs/*`

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Better Auth schema differs from manual SQL | Medium | Medium | Run `npx better-auth generate` first, use its output as source of truth |
| Hono routing conflicts with legacy paths | Low | Low | Legacy routes mounted first, explicit path matching |
| D1 migration fails on remote | Low | Medium | Test locally first, migrations are idempotent CREATE IF NOT EXISTS |

## Security Considerations
- `/trigger` endpoint keeps existing `TRIGGER_SECRET` auth check
- D1 query wrapper enforces user_id scoping to prevent tenant data leakage
- No secrets stored in migration SQL

## Next Steps
- Phase 02 builds auth on top of Hono + D1
- Phase 03 adds stream CRUD routes to the stub route groups
- Phase 04 implements the queue() handler stub
