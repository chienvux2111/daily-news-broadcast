# Researcher-02: Infra Architecture — D1, Queues, Dashboard
Date: 2026-04-17 | Researcher: researcher

---

## Topic 1: D1 Schema Design for Multi-Tenant SaaS

### Isolation Model: Single DB (row-level) vs Per-Tenant DB

| Model | Pros | Cons | Fit |
|---|---|---|---|
| **Single DB, `user_id` FK on all tables** | Simple migrations, cross-tenant analytics, 1 wrangler binding | Tenant leakage risk if query missing `WHERE user_id=?`, D1 10 GB ceiling shared | **Recommended for MVP** |
| Per-tenant DB | Perfect isolation, no leakage | Migrations must apply to every DB (10k iterations), impossible to query across tenants, wrangler binding per tenant is impractical at runtime | Overkill unless regulatory req |

**Decision: single shared D1 DB with `user_id` FK on every table.** This project is MVP-phase, cross-tenant analytics will be needed (billing, usage), and the 10 GB limit is not a concern at launch.

### Recommended Schema

```sql
-- USERS
CREATE TABLE users (
  id          TEXT PRIMARY KEY,          -- UUID or CF Access sub
  email       TEXT UNIQUE NOT NULL,
  plan        TEXT NOT NULL DEFAULT 'free', -- free | pro | team
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_users_email ON users(email);

-- STREAMS (user-owned configs, replaces hardcoded engine config)
CREATE TABLE streams (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  config      TEXT NOT NULL,             -- JSON blob: sources, ai, outputs, schedule
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_streams_user ON streams(user_id);
CREATE INDEX idx_streams_active ON streams(user_id, active);

-- SUBSCRIPTIONS
CREATE TABLE subscriptions (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan            TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'active', -- active | past_due | canceled
  stripe_sub_id   TEXT UNIQUE,
  current_period_end INTEGER,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_subs_user ON subscriptions(user_id);
CREATE INDEX idx_subs_stripe ON subscriptions(stripe_sub_id);

-- RUN HISTORY
CREATE TABLE run_history (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stream_id   TEXT NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
  status      TEXT NOT NULL,             -- success | failed | skipped
  articles    INTEGER DEFAULT 0,
  error       TEXT,
  ran_at      INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_runs_stream ON run_history(stream_id, ran_at DESC);
CREATE INDEX idx_runs_user   ON run_history(user_id,   ran_at DESC);
```

**Key rules:**
- Every query in Worker code MUST include `WHERE user_id = ?` — enforce via a thin `db.query(userId, sql, params)` wrapper
- Foreign keys must be enabled per-connection: `PRAGMA foreign_keys = ON` (D1 does NOT enable by default)
- Use `INTEGER` for timestamps (Unix epoch) — D1 SQLite has no native DATETIME type
- `config` as JSON TEXT is idiomatic for D1; avoid over-normalizing sources/outputs into child tables at MVP

### Migrations Workflow

```bash
# Create migration file
wrangler d1 migrations create newsengine-db add_streams_table

# Apply locally (default since wrangler 3.33)
wrangler d1 migrations apply newsengine-db

# Apply to remote (production)
wrangler d1 migrations apply newsengine-db --remote

# List applied migrations
wrangler d1 migrations list newsengine-db --remote
```

wrangler tracks applied migrations in a `d1_migrations` table automatically. Rollback: D1 auto-captures backup before apply; manual rollback via SQL `DROP`/`ALTER`. No down-migration support — write forward-only migrations.

---

## Topic 2: Cloudflare Queues for Fan-Out

### How It Works

```
Cron Trigger (scheduled())
  → producer.send([{streamId, userId}, ...])   # fan-out: 1 msg per stream
  → Queue
  → consumer queue handler (queue())
      → batch of N messages
      → for each msg: run NewsEngine for that stream
```

### wrangler.toml Config

```toml
[[queues.producers]]
binding  = "STREAM_QUEUE"
queue    = "newsengine-stream-jobs"

[[queues.consumers]]
queue             = "newsengine-stream-jobs"
max_batch_size    = 10      # msgs per invocation (default 10, max 100)
max_batch_timeout = 30      # seconds to wait before delivering partial batch
max_retries       = 3       # per-message retry on failure
dead_letter_queue = "newsengine-stream-jobs-dlq"
```

### Worker Code Pattern

```js
export default {
  // Cron: fan-out — enqueue one message per active stream
  async scheduled(event, env) {
    const streams = await env.DB.prepare(
      'SELECT id, user_id FROM streams WHERE active = 1'
    ).all();
    await env.STREAM_QUEUE.sendBatch(
      streams.results.map(s => ({ body: { streamId: s.id, userId: s.user_id } }))
    );
  },

  // Queue consumer: execute each stream
  async queue(batch, env) {
    for (const msg of batch.messages) {
      const { streamId, userId } = msg.body;
      try {
        await runStream(streamId, userId, env);
        msg.ack();
      } catch (err) {
        msg.retry();  // will retry up to max_retries
      }
    }
  }
};
```

### Key Behaviors
- **Delivery guarantee**: at-least-once. Design `runStream()` to be idempotent (cache dedup already handles this in NewsEngine)
- **Retry**: exponential backoff managed by CF; after `max_retries` → DLQ
- **Batch size**: 10 msgs/batch default. With 100 streams, that's 10 queue handler invocations
- **Worker CPU limit**: 30s per invocation on paid plan; each stream run should complete within that window
- **No ordering guarantee** across messages — fine for independent stream jobs

---

## Topic 3: Dashboard Architecture Decision

### Current State
`src/dashboard/` — Express + Preact SPA. Not yet deployed. On `feature-build-saas` branch.

### Options Evaluated

| | Option A: Express on CF Worker | Option B: CF Worker routes + CF Pages | Option C: Hono on CF Worker |
|---|---|---|---|
| **Express on CF** | Express calls `require('http')` — **incompatible with V8 isolates**. express-to-worker adapters exist but are unmaintained hacks | N/A | N/A |
| **Runtime fit** | Broken | Native | Native |
| **Bundle size** | 572 KB (Express) + adapter overhead | ~0 (native fetch) | ~12 KB (hono/tiny) |
| **CF bindings (D1, KV, Queues)** | Awkward via adapter | First-class | First-class |
| **Routing DX** | Familiar but broken | Manual `if (url.pathname === ...)` — verbose | Express-like, TypeScript-first |
| **CF Pages for SPA** | No | Yes — free, global CDN, auto-deploy from git | Yes (same) |
| **Migration cost from Express** | High (adapter never works cleanly) | Medium (manual routing) | Low (near-identical API) |
| **Project zero-dep philosophy** | Violates | Honors (no framework dep) | Near-honors (12 KB) |
| **Adoption risk** | High — abandoned adapters | Zero — platform native | Low — Hono is CF's recommended framework, creator blog on CF blog |

### Recommendation: Option C — Hono on CF Worker + CF Pages for SPA

**Ranking: C > B > A (A is not viable)**

**Why Hono over raw CF Worker routes (B):**
- Hono adds ~12 KB (hono/tiny) — acceptable given ~572 KB Express was the alternative
- Middleware, routing groups, JWT auth, CORS — all built-in without writing boilerplate
- CF officially documents and recommends Hono; creator post is on CF blog
- Migration from Express routes is near-mechanical (`app.get` → `app.get`, same signatures)
- Hono RPC client enables type-safe API calls from the Preact SPA (optional, YAGNI for now)

**Architecture:**
```
CF Worker (Hono)          CF Pages
  POST /api/auth         ←  Preact SPA (static build)
  GET  /api/streams         fetch('/api/...') to Worker
  POST /api/streams
  GET  /api/runs
  POST /api/webhooks/stripe

CF D1 (bound to Worker)
CF Queues (bound to Worker)
```

**Migration path from Express:**
1. `npm install hono` → replace `express` import with `import { Hono } from 'hono'`
2. Change `app.listen(PORT)` → `export default app` (Hono auto-exports CF fetch handler)
3. Replace `req.body` with `await c.req.json()`, `res.json()` with `c.json()`
4. D1/KV/Queue bindings available via `c.env.DB`, `c.env.STREAM_QUEUE`
5. Deploy SPA static output to CF Pages with `_routes.json` to proxy `/api/*` to Worker

---

## Summary Rankings

| Decision | Choice | Confidence |
|---|---|---|
| D1 isolation model | Single DB + user_id FK enforcement | High |
| Queue fan-out pattern | 1 cron → sendBatch → per-stream consumer | High |
| Dashboard framework | Hono (CF Worker) + CF Pages (SPA) | High |

---

## Unresolved Questions

1. **Auth strategy for dashboard**: CF Access (zero-config SSO) vs JWT-based login vs Clerk/Auth0 — not researched here
2. **D1 size ceiling**: Single DB at 10 GB — at what user scale does this become a concern? (needs capacity modeling based on run_history growth rate)
3. **Stripe webhooks**: Idempotency key handling in D1 not designed — needed before billing goes live
4. **CF Pages + Worker routing**: `_routes.json` or custom domain proxying needed to avoid CORS for `/api/*` calls from Pages — minor but must be solved in implementation

---

## Sources
- [Cloudflare D1 Overview](https://developers.cloudflare.com/d1/)
- [D1 Migrations Reference](https://developers.cloudflare.com/d1/reference/migrations/)
- [Scaling D1 — DEV Community](https://dev.to/araldhafeeri/scaling-your-cloudflare-d1-database-from-the-10-gb-limit-to-tbs-4a16)
- [Cloudflare Queues — How Queues Works](https://developers.cloudflare.com/queues/reference/how-queues-works/)
- [Queues Batching & Retries](https://developers.cloudflare.com/queues/configuration/batching-retries/)
- [Queues Configuration](https://developers.cloudflare.com/queues/configuration/configure-queues/)
- [Cron Triggers — CF Workers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
- [Hono on CF Workers — Official Guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/more-web-frameworks/hono/)
- [Hono Getting Started — CF Workers](https://hono.dev/docs/getting-started/cloudflare-workers)
- [The Story of Hono — CF Blog](https://blog.cloudflare.com/the-story-of-web-framework-hono-from-the-creator-of-hono/)
- [Hono vs Express 2026](https://jcalloway.dev/hono-vs-express-2026-which-javascript-framework-ships-faster-apis)
