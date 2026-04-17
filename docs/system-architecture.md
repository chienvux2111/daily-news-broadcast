# System Architecture — NewsEngine SaaS

**Last updated:** April 17, 2026

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    CF Pages (Landing)                           │
│                    CF Pages (Dashboard SPA)                      │
└────────────────────────┬────────────────────────────────────────┘
                         │
                    HTTPS / REST
                         │
┌────────────────────────▼────────────────────────────────────────┐
│            Cloudflare Worker (API)                              │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Hono App                                                 │  │
│  │  ├─ /api/auth/* ────────────────────────────────────────┤  │
│  │  │  └─ Better Auth (signup, login, Google OAuth)        │  │
│  │  │     └─ Polar webhook (subscription state)            │  │
│  │  ├─ /api/streams (CRUD) ──────────────────────────────┤  │
│  │  │  └─ Requires auth, scoped to user_id                │  │
│  │  ├─ /api/runs (history) ──────────────────────────────┤  │
│  │  │  └─ Run logs, execution results                     │  │
│  │  └─ /api/billing ─────────────────────────────────────┤  │
│  │     └─ Subscription management                         │  │
│  │                                                          │  │
│  │ Middleware Stack                                        │  │
│  │  ├─ CORS (CF Pages origin)                             │  │
│  │  ├─ Auth context (session → user_id)                   │  │
│  │  ├─ Rate limiting (60/min auth, 120/min API)          │  │
│  │  └─ Feature gates (tier-based)                         │  │
│  │                                                          │  │
│  │ Cron Triggers (built-in)                               │  │
│  │  ├─ */30 * * * * → Channel runner                      │  │
│  │  ├─ 0 * * * * → Token refresh                          │  │
│  │  └─ 0 3 * * * → Cleanup                                │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────────────┘
                         │
        ┌────────────────┼────────────────┐
        │                │                │
        ▼                ▼                ▼
   ┌─────────┐   ┌────────────┐   ┌──────────┐
   │ D1      │   │ CF Queue   │   │ CF KV    │
   │ SQLite  │   │ (jobs)     │   │ (cache)  │
   │         │   │            │   │          │
   │ users   │   │ stream-    │   │ article  │
   │ streams │   │ jobs queue │   │ dedup    │
   │ runs    │   │            │   │          │
   │ billing │   │ max_batch_ │   │          │
   │         │   │ size: 10   │   │          │
   └─────────┘   │ retries: 3 │   └──────────┘
                 │ dlq: yes   │
                 └────────────┘
                      │
                      │ Queue consumer job handler
                      │
        ┌─────────────▼──────────────┐
        │  Stream Executor           │
        │  (NewsEngine Pipeline)     │
        │                            │
        │  1. Fetch sources          │
        │  2. Dedup cache            │
        │  3. Middleware             │
        │  4. Summarize (AI)         │
        │  5. Send outputs           │
        │  6. Save run history       │
        └──────────────┬─────────────┘
                       │
        ┌──────────────┼──────────────┐
        │              │              │
        ▼              ▼              ▼
    ┌────────┐   ┌────────┐    ┌────────┐
    │Sources │   │Outputs │    │ D1     │
    │        │   │        │    │(Hist.) │
    │RSS/    │   │Tel/    │    │        │
    │HN/     │───│Slack/  │────│ run_   │
    │Reddit/ │   │Discord │    │history │
    │DevTo   │   │Email   │    │        │
    │        │   │Webhook │    │        │
    └────────┘   └────────┘    └────────┘
         │            │            ▲
         │            │            │
    External sources  External     Back to API
    (public APIs)     channels     for history
                      (end-users)
```

## Data Flow

### 1. User Creates Stream (SaaS Dashboard)

```
Dashboard → POST /api/streams
  ├─ Validate auth (Better Auth session)
  ├─ Extract user_id from session
  ├─ Validate stream config (sources, AI, outputs, schedule)
  ├─ Generate stream ID (UUID)
  ├─ INSERT into D1 streams table (user_id scoped)
  ├─ Return stream with masked secrets (token***, URL***)
  └─ Frontend navigates to stream detail
```

### 2. Scheduled Execution (Cron → Queue)

```
Cron (*/30 * * * *) fires
  └─ Channel runner handler
     ├─ Query D1: SELECT * FROM streams WHERE active=1 AND next_run_at <= NOW()
     ├─ For each stream, produce job:
     │  ├─ Stream ID
     │  ├─ User ID
     │  └─ Run timestamp
     ├─ STREAM_QUEUE.send(jobs)
     └─ Update streams.next_run_at to next cron slot
```

### 3. Queue Consumer (Dequeued Job)

```
CF Queue consumer receives batch (max 10 jobs)
  └─ For each job:
     ├─ Fetch raw stream config from D1
     │  ├─ user_id scoping ensures security
     │  └─ Decrypt secrets (if stored encrypted)
     ├─ Instantiate NewsEngine:
     │  ├─ Add sources (RSS, HN, etc.)
     │  ├─ Add AI provider (Claude, OpenAI, etc.)
     │  ├─ Add outputs (Telegram, Slack, etc.)
     │  └─ Configure cache (CF KV)
     ├─ Run pipeline:
     │  ├─ Fetch articles from all sources
     │  ├─ Dedup against CF KV cache
     │  ├─ Run middleware transforms
     │  ├─ Summarize with AI
     │  └─ Send to all outputs (parallel)
     ├─ Create run_history record:
     │  ├─ INSERT into run_history (user_id, stream_id, status, articles_count, ran_at)
     │  └─ status = 'success' or 'error'
     └─ If error → automatic retry (CF Queue handles)
        └─ After 3 retries → dead-letter queue
```

### 4. Run History Retrieval (Dashboard)

```
Dashboard → GET /api/streams/:streamId/runs
  ├─ Validate auth & user_id scope
  ├─ Query D1: SELECT * FROM run_history WHERE stream_id=? AND user_id=? ORDER BY ran_at DESC
  ├─ Return paginated runs with:
  │  ├─ Run ID
  │  ├─ Status (success, error, pending)
  │  ├─ Articles count
  │  ├─ Error message (if failed)
  │  └─ Timestamp
  └─ Frontend displays timeline of executions
```

## Tenant Isolation Security Model

### User-Scoped Queries

Every D1 query includes `WHERE user_id = ?`:

```javascript
// Correct: user_id enforced
await db.prepare('SELECT * FROM streams WHERE id=? AND user_id=?')
  .bind(streamId, userId).first();

// Wrong: missing user_id check (security bug)
await db.prepare('SELECT * FROM streams WHERE id=?')
  .bind(streamId).first();
```

### Session-Based Authentication

```javascript
// Better Auth session (cookie-based)
const session = await getSession(c.req);
if (!session) return c.json({ error: 'Unauthorized' }, 401);

// Extract user_id from session context
const userId = session.user.id;

// All API operations use userId for scoping
const streams = await listStreams(db, userId);
```

### Rate Limiting

- Auth routes: 60 requests/min by IP (prevent brute-force)
- API routes: 120 requests/min per authenticated user (fair usage)

### Secrets Masking

```javascript
// Before returning stream to client:
// out.botToken = '***' + out.botToken.slice(-4)
// Only last 4 chars visible (e.g., ***abc123)
```

## Billing & Subscription Model

### Tier Definitions

Defined in `constants/products.js` and `constants/tier-limits.js`:

| Tier | Streams | Sources | AI | Outputs | Monthly |
|------|---------|---------|----|---------:|-------:|
| Free | 3 | Basic (RSS, HN, Reddit) | Groq (free) | Telegram only | $0 |
| Pro | 20 | All | Claude, GPT-4 | All | $29 |
| Business | ∞ | All | All | All | Custom |

### Polar Integration

```javascript
// On user signup → create Polar customer
const polarCustomer = await polar.customers.create({
  email: user.email,
  name: user.name,
});

// On subscription purchase → webhook fires
polar.webhooks.onCustomerStateChanged((payload) => {
  const { customerId, productId, status } = payload.event.data;
  
  // Upsert into D1
  await db.prepare(
    `INSERT INTO polar_subscription (id, polarCustomerId, productId, status, ...)
     VALUES (?, ?, ?, ?, ...)`
  ).run();
});
```

### Feature Gates

```javascript
// Enforce tier limits in stream creation
const limits = getTierLimits(user.plan);
if (streams.length >= limits.maxStreams) {
  return c.json({ error: 'Stream limit exceeded' }, 402);
}
```

## Multi-Channel Architecture

### Channel Types

1. **Telegram** (`channels/telegram-channel.js`)
   - OAuth 2.0 flow
   - Token stored in user account (Better Auth)
   - Automatic token refresh (hourly cron)

2. **X/Twitter** (`channels/x-channel.js`)
   - OAuth 2.0 (3-legged)
   - Access token + refresh token stored
   - Automatic refresh on token expiry

3. **Facebook Pages** (`channels/facebook-channel.js`)
   - OAuth 2.0 with page ID selector
   - Page access token stored
   - No automatic refresh (Facebook tokens long-lived)

4. **Threads** (`channels/threads-channel.js`)
   - OAuth 2.0 (via Meta)
   - Shares token with Facebook
   - Automatic refresh

### OAuth Token Management

```javascript
// Store in Better Auth account table
const account = {
  userId: user.id,
  providerId: 'telegram',
  accessToken: 'token_...',
  accessTokenExpiresAt: futureDate,
};

// Hourly cron refreshes tokens
cron.schedule('0 * * * *', async () => {
  const expiring = await db.prepare(
    'SELECT * FROM account WHERE accessTokenExpiresAt <= ?'
  ).bind(nowPlus1Hour).all();
  
  for (const account of expiring) {
    const newToken = await refreshToken(account);
    await db.prepare(
      'UPDATE account SET accessToken=?, accessTokenExpiresAt=? WHERE id=?'
    ).bind(newToken, newExpiresAt, account.id).run();
  }
});
```

## Cache Strategy

### CF KV (Article Deduplication)

**Key:** `{userId}:{streamId}:article:{urlHash}`  
**Value:** `{ title, url, publishedAt }`  
**TTL:** 30 days

```javascript
// Before sending articles to outputs, check cache
for (const article of articles) {
  const cached = await cache.get(`${userId}:${streamId}:article:${hash(article.url)}`);
  if (cached) continue; // Skip already-sent article
  
  // New article → send to outputs
  await outputs.forEach(out => out.send(article));
  
  // Mark as sent
  await cache.set(`${userId}:${streamId}:article:${hash(article.url)}`, 
    { title: article.title, url: article.url, publishedAt: article.publishedAt },
    { expirationTtl: 30 * 24 * 60 * 60 }
  );
}
```

### Configurable Cache per Stream

Stream config can specify cache type:
- `cf-kv` — Production (Cloudflare)
- `redis` — Self-hosted
- `file` — Local dev (Node.js only)
- `memory` — Testing

## Error Handling & Resilience

### Source Fetch Errors (Non-Fatal)

```javascript
// If RSS feed fails, continue with other sources
try {
  articles = await source.fetch();
} catch (err) {
  console.error(`Source ${source.id} failed: ${err.message}`);
  articles = []; // Return empty, don't crash
}
```

### AI Summarization Errors (Fatal)

```javascript
// If AI fails, whole run fails
try {
  summary = await ai.summarize(articles);
} catch (err) {
  throw new Error(`AI summarization failed: ${err.message}`);
  // Queue consumer catches, retries via CF Queue
}
```

### Output Send Errors (Non-Fatal per Output)

```javascript
// If one output fails, continue with others
for (const output of outputs) {
  try {
    await output.send(content);
  } catch (err) {
    console.error(`Output ${output.id} failed: ${err.message}`);
    // Log to run_history but don't stop
  }
}
```

## Monitoring & Observability

### Run History Tracking

```sql
-- D1 query: recent failed runs
SELECT * FROM run_history 
WHERE user_id = ? 
  AND status = 'error' 
ORDER BY ran_at DESC LIMIT 20;
```

### Error Logs

```javascript
// Stored in run_history.error field (text)
{
  id: "run-123",
  user_id: "user-456",
  stream_id: "stream-789",
  status: "error",
  error: "Source 'hackernews' failed: Algolia API timeout",
  ran_at: 1713406800,
}
```

### Cron Health Checks

```javascript
// Track cron execution in D1 (future)
INSERT INTO cron_runs (cron_name, status, error, ran_at)
VALUES ('channel-runner', 'success', null, ?);
```

## Deployment & Infrastructure

### Cloudflare Workers Stack

```
CF Worker (src/adapters/cloudflare.js)
├─ Incoming: HTTPS request → Hono app
├─ Processing: Middleware → route handler
├─ Database: D1 bindings
├─ Cache: CF KV bindings
├─ Queue: Produce to CF Queue
├─ Cron: Built-in triggers
└─ Outgoing: External APIs (sources, outputs)

Limits:
├─ Execution time: 30 seconds (request), 30 seconds (queue)
├─ Memory: 128 MB
├─ Connections: 600 concurrent
└─ Inbound payload: 100 MB
```

### Local Node.js Adapter

```
Node.js CLI (src/adapters/node.js)
├─ Mode: run (once), cron (daemon), preview (dry-run)
├─ Database: D1 REST API (if remote) or SQLite (local)
├─ Cache: File system or Redis
├─ Queue: Simulated via setTimeout
└─ Cron: node-cron (scheduler)
```

### Dashboard Server

```
Express server (src/dashboard/server.js)
├─ Port: 3000 (default)
├─ Config: streams.config.json (file-based)
├─ Scheduling: node-cron
├─ UI: Preact SPA (public/)
└─ Events: Server-Sent Events (SSE) for live updates
```

## Performance Characteristics

### Request Latency

- Auth route: ~50-200ms (database + session)
- Stream CRUD: ~30-100ms (D1 query)
- Stream listing: ~100-500ms (depends on stream count)

### Queue Latency

- Enqueue: ~10ms
- Dequeue to first execution: ~5-30 seconds (CF Queue scheduling)
- Total pipeline: ~10-60 seconds (depends on source latency)

### Database Queries

- D1 is SQLite with sub-10ms latency for most queries
- Indexes on user_id, stream_id, run timestamps for fast filtering
- Batch inserts for run_history

## Scalability Considerations

### Current Bottlenecks

1. **Source Fetching** — Sequential fetch per stream (mitigated by concurrency limit)
2. **AI Summarization** — Blocking per stream (no parallel streams)
3. **CF Queue** — Batch size 10 (manageable)

### Future Scaling Paths

1. **Multi-worker coordination** — Distribute streams across workers
2. **Durable Objects** — Per-user state for advanced features
3. **Shared queue** — Cross-region queue distribution
4. **Caching layer** — Redis for frequently accessed configs
5. **Analytics DB** — Move run_history to separate analytics table

## Security Checklist

- [x] All API routes require authentication
- [x] User_id scoping on every database query
- [x] Secrets masked in API responses
- [x] Rate limiting on auth & API routes
- [x] CORS configured for CF Pages origin only
- [x] Better Auth handles password hashing
- [x] OAuth tokens stored securely (D1 encrypted at rest)
- [x] Webhook signature verification (Polar)
- [ ] SQL injection prevention (parameterized queries ✓, but add input validation)
- [ ] HTTPS enforced (CF auto)
- [ ] CSRF tokens (cookie SameSite=Strict covers most)
