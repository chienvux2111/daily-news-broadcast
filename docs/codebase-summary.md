# Codebase Summary — NewsEngine SaaS

**Last updated:** April 17, 2026

## Overview

NewsEngine is a plugin-based news aggregation platform with SaaS multi-tenant architecture. It fetches articles from any data source, summarizes with any AI model, and sends to any output channel.

**Core principle:** Zero lock-in through swappable plugins.

## Directory Structure

```
src/
├── core/                           # Engine core — platform agnostic
│   ├── contracts.js                # 4 plugin interfaces (Source, AI, Output, Cache)
│   ├── engine.js                   # NewsEngine orchestrator (fluent builder API)
│   ├── caches.js                   # 4 cache implementations (Memory, File, CF KV, Redis)
│   ├── scoring.js                  # Engagement + recency + credibility scoring
│   ├── semantic-dedup.js           # Bigram title similarity deduplication
│   ├── grouping.js                 # Article grouping by category
│   ├── prefixed-cache.js           # Cache key prefixing utility
│   └── index.js                    # Barrel exports
│
├── api/                            # SaaS API layer (Hono + Better Auth)
│   ├── app.js                      # Hono app factory with middleware stack
│   ├── auth.js                     # Better Auth + Polar billing plugin configuration
│   ├── routes-legacy.js            # Legacy endpoints for backwards compatibility
│   ├── middleware/
│   │   ├── auth.js                 # requireAuth() middleware
│   │   ├── db.js                   # D1 database context injection
│   │   ├── rate-limit.js           # Rate limiting by IP & user
│   │   └── feature-gate.js         # Feature flag middleware
│   ├── routes/
│   │   ├── streams.js              # CRUD operations for user streams
│   │   ├── runs.js                 # Run history & execution logs
│   │   └── billing.js              # Billing & subscription endpoints
│   ├── services/
│   │   ├── stream-service.js       # D1 CRUD for streams (tenant-scoped)
│   │   ├── stream-executor.js      # Stream execution pipeline
│   │   ├── queue-producer.js       # CF Queue job enqueuing
│   │   ├── queue-consumer.js       # CF Queue consumer handler
│   │   ├── run-history-service.js  # Run history persistence
│   │   ├── billing-service.js      # Polar subscription management
│   │   ├── cron-helper.js          # Cron scheduling utilities
│   │   └── cleanup-service.js      # Cleanup job (stale runs, etc.)
│   ├── validators/
│   │   └── stream-config.js        # Stream config validation schema
│   └── constants/
│       ├── products.js             # Polar product definitions
│       └── tier-limits.js          # Free/Pro/Business tier limits
│
├── sources/                        # Data source plugins
│   ├── rss.js                      # RSS/Atom feed parser + batch helper
│   ├── html-scraper.js             # HTML scraper (regex-based)
│   ├── hackernews.js               # HackerNews Algolia API
│   ├── reddit.js                   # Reddit public JSON API
│   ├── devto.js                    # Dev.to API + generic JSONAPISource
│   ├── github-trending.js          # GitHub Search API (popular repos)
│   └── index.js
│
├── ai/                             # AI summarization plugins
│   ├── claude.js                   # Anthropic Claude native API
│   ├── openai-compat.js            # OpenAI-compatible wrapper (GPT, Groq, etc.)
│   ├── create-ai.js                # Shared factory for all adapters
│   ├── _prompts.js                 # Editorial prompt builder (6 styles)
│   └── index.js
│
├── outputs/                        # Output channel plugins
│   ├── telegram.js                 # Telegram Bot (auto-split, markdown fallback)
│   ├── channels.js                 # Slack, Discord, Email, Webhook, Markdown File
│   └── index.js
│
├── channels/                       # Multi-channel architecture
│   ├── abstract-channel.js         # Channel base class
│   ├── telegram-channel.js         # Telegram multi-channel support
│   ├── x-channel.js                # X (Twitter) OAuth 2.0
│   ├── facebook-channel.js         # Facebook Pages API
│   ├── threads-channel.js          # Threads (Meta) integration
│   └── index.js
│
├── presets/                        # Pre-configured source bundles
│   └── index.js                    # bigTechBlogs(), communitySources(), etc.
│
├── dashboard/                      # Config-driven monitor UI (Express)
│   ├── server.js                   # Express server + SSE event streaming
│   ├── config-loader.js            # Load streams.config.json
│   ├── scheduler.js                # Cron job scheduling
│   └── public/
│       ├── components/             # Preact UI components
│       └── pages/
│           ├── onboarding.js       # Stream wizard
│           ├── stream-builder.js   # Stream configuration UI
│           ├── streams.js          # Stream list view
│           ├── stream-detail.js    # Stream detail + execution logs
│           ├── runs.js             # Run history
│           ├── run-detail.js       # Run details
│           ├── billing.js          # Billing & subscription UI
│           ├── signup.js           # Auth signup
│           └── error-log.js        # Error logs
│
├── adapters/                       # Runtime adapters
│   ├── cloudflare.js               # Cloudflare Worker (cron + HTTP)
│   └── node.js                     # Node.js CLI (run, cron, preview)
│
└── utils/
    └── token-store.js             # OAuth token persistence

migrations/
└── 0001_initial_schema.sql        # D1 database schema (users, streams, runs, billing)

landing/
├── index.html                      # CF Pages landing page
└── _routes.json                    # Routing config for CF Pages

wrangler.toml                       # Cloudflare Workers configuration
├── d1_databases: newsengine-db
├── queues: newsengine-stream-jobs
├── kv_namespaces: NEWS_CACHE
└── crons: channel runner (*/30), token refresh (hourly), cleanup (3am)
```

## Key Components

### 1. Core Engine (`src/core/`)

**Purpose:** Platform-agnostic news aggregation orchestrator.

- `engine.js` — Main NewsEngine class with fluent builder API
  - Pipeline: Fetch → Dedup → Middleware → AI → Outputs
  - Retry logic, bilingual support, dry-run mode
  - Methods: `addSource()`, `useAI()`, `addOutput()`, `useCache()`, `use()` (middleware), `run()`

- `contracts.js` — Abstract plugin base classes
  - `SourcePlugin` — `.fetch(options) → Article[]`
  - `AIPlugin` — `.summarize(articles, options) → SummaryResult`
  - `OutputPlugin` — `.send(content, options) → SendResult`
  - `CachePlugin` — `.get()`, `.set()`, `.has()`, `.delete()`

- `caches.js` — 4 cache implementations
  - `MemoryCache` — in-memory (testing, serverless)
  - `FileCache` — JSON file (local dev, Docker)
  - `RedisCache` — Redis (production, multi-instance)
  - `CloudflareKVCache` — CF KV (Cloudflare Workers)

### 2. SaaS API Layer (`src/api/`)

**Purpose:** Multi-tenant REST API for stream management, billing, and execution.

**Framework:** Hono (lightweight, CF Workers native)

**Key services:**
- `app.js` — Hono app factory with CORS, auth, rate limiting
- `auth.js` — Better Auth + Polar billing integration
  - Email/password signup
  - Google OAuth
  - Cookie sessions in D1
  - Polar webhook handlers (subscription state changes)

**Routes:**
- `/api/auth/*` — Better Auth (signup, login, logout, OAuth callback)
- `/api/streams` — Stream CRUD (list, create, update, delete, toggle)
- `/api/runs` — Run history & execution logs
- `/api/billing` — Subscription management & portal

**Middleware:**
- `requireAuth()` — Ensures authenticated user context
- `rateLimitByIP(60)` — Auth routes: 60 req/min
- `rateLimitByUser(120)` — API routes: 120 req/min per authenticated user

### 3. Multi-Tenant Architecture

**Tenant Isolation:**
- Every API request scoped to authenticated `user_id`
- Stream CRUD enforces `WHERE user_id = ?` in all queries
- Billing per user via Polar subscriptions

**Database (D1):**
```sql
users (id, email, plan, createdAt)
└── streams (id, user_id, name, config, active)
    └── run_history (id, stream_id, status, articles_count, ran_at)
└── sessions (id, token, expiresAt, userId)
└── accounts (id, userId, providerId, accessToken)
└── polar_customer (id, userId, polarCustomerId)
    └── polar_subscription (id, polarCustomerId, productId, status)
```

**Stream Configuration:**
```javascript
{
  name: "Tech News Digest",
  config: {
    sources: [
      { type: "rss", feedUrl: "https://...", limit: 5 },
      { type: "hackernews", minPoints: 100 },
    ],
    ai: {
      provider: "openai",
      model: "gpt-4o-mini",
      options: { language: "en", style: "digest" }
    },
    outputs: [
      { type: "telegram", botToken: "...", chatId: "..." },
      { type: "email", to: "user@example.com" }
    ],
    schedule: "0 7 * * *"  // Daily at 7 AM
  }
}
```

### 4. Queue-Based Execution (`src/api/services/queue-*.js`)

**Pattern:** Producer → CF Queue → Consumer

- `queue-producer.js` — `enqueueStreamJob(streamId, userId)` for fan-out
- `queue-consumer.js` — Processes jobs from `newsengine-stream-jobs` queue
  - Fetches raw stream config from D1
  - Executes NewsEngine pipeline
  - Writes run history

**Crons trigger producers:**
- */30 * * * * — Channel runner (process scheduled streams)
- 0 * * * * — Token refresh (OAuth token rotation)
- 0 3 * * * — Cleanup (stale runs, sessions)

### 5. Billing Integration (`src/api/services/billing-service.js`, `constants/`)

**Provider:** Polar.sh (open-source billing)

**Tiers:**
- `free` — 3 streams, basic sources
- `pro` — 20 streams, all sources, advanced AI
- `business` — unlimited, custom integrations

**Product IDs mapped in `constants/products.js`**
**Tier limits enforced in `constants/tier-limits.js`**

**Webhook handlers:**
- `onCustomerStateChanged` — Create/update/revoke subscriptions in D1
- `onOrderPaid` — Upsert subscription on payment

### 6. Output Channels

**Core outputs** (`src/outputs/channels.js`):
- `TelegramOutput` — Auto-split >4096 chars, markdown fallback
- `SlackOutput` — Incoming Webhook
- `DiscordOutput` — Auto-split >2000 chars
- `EmailOutput` — Via Resend or SendGrid
- `WebhookOutput` — Generic HTTP POST
- `MarkdownFileOutput` — Save as `.md` file

**Multi-channel support** (`src/channels/`):
- X (Twitter) — OAuth 2.0 authentication
- Facebook Pages — API integration
- Threads — Meta integration
- Telegram — Extended multi-account support

**Channel architecture:**
- Base class `AbstractChannel` defines interface
- Each channel handles auth token persistence & refresh
- Config-driven channel instantiation in stream executor

### 7. Data Sources

**Core sources** (`src/sources/`):
- `RSSSource` — RSS/Atom feeds (zero deps, regex-based)
- `HTMLScraperSource` — Regex-based HTML extraction
- `HackerNewsSource` — Algolia API, filter by points
- `RedditSource` — Public JSON API, subreddit + upvotes
- `DevToSource` — Dev.to API + generic `JSONAPISource`
- `GitHubTrendingSource` — GitHub Search (popular repos)

**Custom sources:**
Extend `SourcePlugin`, implement `async fetch(options)` returning `Article[]`

### 8. AI Providers

**Built-in providers:**
- `ClaudeAI` — Anthropic Claude (native API)
- `OpenAICompatibleAI` — GPT, Groq, Gemini, Ollama, OpenRouter, Together

**Prompt system** (`ai/_prompts.js`):
- `buildPrompt(articles, {language, style, audience})` → `{system, user}`
- Styles: `digest`, `bullet`, `thread`, `newsletter`, `weekly`, `mustread`
- Languages: `vi`, `en`
- Auto-groups articles by category

## Dependencies

**Required:**
- `hono` ^4.12.14 — Lightweight web framework
- `better-auth` ^1.6.5 — Auth framework
- `@polar-sh/better-auth` ^1.8.3 — Polar plugin for billing
- `@polar-sh/sdk` ^0.46.7 — Polar SDK
- `express` ^5.2.1 — Dashboard server
- `node-cron` ^3.0.3 — Cron scheduling

**Optional:**
- `dotenv` — .env file loading
- `redis` — RedisCache only

**Zero deps for core:**
- No XML parsers (regex-based)
- No HTTP clients (native `fetch()`)
- Cloudflare Workers & Node 18+ compatible

## Environment Variables

```bash
# Auth & Database
APP_URL=https://api.newsengine.app
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# Billing
POLAR_ACCESS_TOKEN=...
POLAR_WEBHOOK_SECRET=...

# AI (at least one required)
ANTHROPIC_API_KEY=...
OPENAI_API_KEY=...
GROQ_API_KEY=...

# Outputs (as needed)
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...

# CF Worker Bindings (auto-injected)
DB=...                    # D1 database
STREAM_QUEUE=...          # CF Queue
NEWS_CACHE=...            # CF KV

# Configuration
BROADCAST_MODE=drip       # drip | digest
DRIP_BATCH_SIZE=5
DRIP_DELAY_MS=3600000     # 1 hour
SUMMARY_LANGUAGE=vi
MAX_ARTICLES=15
CONCURRENCY_LIMIT=5
```

## Deployment

### Cloudflare Workers (Production)

```bash
wrangler deploy
```

Includes:
- HTTP API for streams, runs, billing
- Cron triggers for channel runner, token refresh, cleanup
- CF Queue consumer for stream execution
- CF KV for caching

### Node.js (Local/VPS)

```bash
node src/adapters/node.js run        # One-time run
node src/adapters/node.js cron       # Daemon mode
node src/adapters/node.js preview    # Dry run
```

### Docker

```bash
docker compose up -d
```

### Dashboard (Dev Monitor)

```bash
node src/dashboard/server.js
```

Express server on port 3000, reads `streams.config.json`, serves monitoring UI.

## Architecture Patterns

### Plugin System

All plugins extend abstract base classes from `core/contracts.js`:
- **Composition over inheritance** — plugins are dependencies, not parent classes
- **Type checking at registration** — engine validates plugin types
- **Fail-safe defaults** — missing plugins don't crash engine

### Fluent Builder

Engine uses method chaining for readability:
```javascript
new NewsEngine()
  .addSource(source1, source2)
  .useAI(claude)
  .addOutput(telegram)
  .useCache(redis)
  .configure({ language: 'vi', style: 'digest' })
  .run()
```

### Pipeline Middleware

User-defined transforms inserted into pipeline:
```javascript
.use(articles => articles.filter(...))
.use(articles => articles.sort(...))
```

### Tenant Isolation

All API queries scoped to `user_id`:
- No cross-tenant data leaks
- D1 enforces foreign keys
- Rate limiting per user
- Billing per user

### Queue-Based Execution

CF Queues decouple stream scheduling from execution:
- Cron triggers producer
- Producer enqueues jobs
- Consumer processes independently
- Retry logic built-in
- Dead-letter queue for failures

## Code Standards

- **ES Modules only** — `import/export`, `"type": "module"` in package.json
- **Plain JS, no TypeScript** — JSDoc annotations for types
- **No build step** — runs directly
- **Error handling** — try/catch in sources (return `[]`), throw in AI/outputs (engine catches)
- **Concurrency** — `Promise.allSettled`, 500ms delay between batches

## File Size Guidelines

- Individual modules: <200 LOC
- Services: <250 LOC
- Routes: <150 LOC per endpoint
- Split large files into smaller focused components

## Key Files to Know

| File | LOC | Purpose |
|------|-----|---------|
| `core/engine.js` | ~300 | Main orchestrator |
| `core/contracts.js` | ~100 | Plugin interfaces |
| `api/app.js` | ~70 | Hono app factory |
| `api/auth.js` | ~120 | Better Auth config |
| `api/services/stream-service.js` | ~150 | Stream CRUD |
| `api/services/stream-executor.js` | ~200 | Pipeline executor |
| `sources/rss.js` | ~120 | RSS parser |
| `ai/_prompts.js` | ~150 | Prompt builder |
| `outputs/telegram.js` | ~130 | Telegram output |
| `adapters/cloudflare.js` | ~80 | CF Worker entry |

## Testing & Validation

- No test suite yet; integration tests run in production
- Dry-run mode: `.run({ dryRun: true })` executes pipeline without sending
- Preview: `node src/adapters/node.js preview` fetches + summarizes only
- Rate limiting tests: manual API calls against `/api/auth/*` limits

## Next Steps & Roadmap

1. ✅ Core engine & plugin system
2. ✅ Initial data sources (RSS, HTML, HN, Reddit, Dev.to)
3. ✅ AI providers (Claude, OpenAI-compatible)
4. ✅ Outputs (Telegram, Slack, Discord, Email)
5. ✅ SaaS API layer (Hono + Better Auth)
6. ✅ Multi-tenant streams & billing (Polar)
7. ✅ Dashboard UI (Preact)
8. ⏳ Test suite (unit + integration)
9. ⏳ Analytics & observability (LogRocket, Sentry)
10. ⏳ Advanced scheduling & triggers
