# Project Roadmap — NewsEngine SaaS

**Last updated:** April 17, 2026

## Vision

NewsEngine is a plugin-based news aggregation platform that enables users to:
1. **Aggregate** articles from any data source (RSS, APIs, etc.)
2. **Summarize** with any AI model
3. **Distribute** to any output channel
4. **Control** via self-serve dashboard

**Zero lock-in:** Users can export configs, switch providers, or self-host anytime.

## Current Status

**Phase:** SaaS MVP (v2.0) — COMPLETE ✅

### What's Shipped

#### Core Engine (Phase 1) ✅
- [x] NewsEngine orchestrator (fluent builder API)
- [x] 4 plugin contracts (Source, AI, Output, Cache)
- [x] Execution pipeline (fetch → dedup → AI → outputs)
- [x] Middleware system for content transformation
- [x] 6 built-in sources (RSS, HTML, HN, Reddit, Dev.to, GitHub Trending)
- [x] 2 AI providers (Claude, OpenAI-compatible)
- [x] 6 output types (Telegram, Slack, Discord, Email, Webhook, Markdown)
- [x] 4 cache backends (Memory, File, Redis, CF KV)

#### Multi-Channel Architecture (Phase 2) ✅
- [x] Abstract channel base class
- [x] X/Twitter OAuth 2.0 integration
- [x] Facebook Pages API integration
- [x] Threads (Meta) integration
- [x] Telegram multi-account support
- [x] Environment-gated channel activation
- [x] Platform-aware prompt generation

#### SaaS API Layer (Phase 3) ✅
- [x] Hono framework with middleware stack
- [x] CORS for CF Pages origin
- [x] Rate limiting (IP & user-based)
- [x] Feature gates for tier-based access

#### Authentication & Authorization (Phase 4) ✅
- [x] Better Auth integration
- [x] Email + password signup/login
- [x] Google OAuth 2.0
- [x] Cookie-based sessions in D1
- [x] User profile management
- [x] Session persistence across requests

#### Multi-Tenant Streams (Phase 5) ✅
- [x] D1 database schema (users, sessions, streams, runs)
- [x] Stream CRUD API endpoints
- [x] User-scoped queries (tenant isolation)
- [x] Stream config validation
- [x] Stream enable/disable toggle
- [x] Secrets masking in API responses

#### Queue-Based Execution (Phase 6) ✅
- [x] CF Queue producer (enqueue stream jobs)
- [x] CF Queue consumer (dequeue & execute)
- [x] Cron triggers (*/30, hourly, daily)
- [x] Automatic retry logic (3 retries + DLQ)
- [x] Run history tracking
- [x] Error logging in run_history

#### Billing & Subscriptions (Phase 7) ✅
- [x] Polar.sh integration (@polar-sh/sdk, @polar-sh/better-auth)
- [x] Tier definitions (Free, Pro, Business)
- [x] Webhook handlers (subscription state changes)
- [x] Polar customer creation on signup
- [x] Tier-based feature gates (stream count, outputs, etc.)
- [x] Subscription status tracking in D1
- [x] Billing API routes

#### Dashboard UI (Phase 8) ✅
- [x] Landing page (CF Pages)
- [x] Dashboard SPA (Preact)
- [x] Signup/login pages
- [x] Stream builder (visual config)
- [x] Streams list view
- [x] Stream detail & execution logs
- [x] Run history timeline
- [x] Billing & subscription management
- [x] Onboarding wizard
- [x] Error log viewer

#### Infrastructure & Deployment (Phase 9) ✅
- [x] Cloudflare Workers setup (wrangler.toml)
- [x] D1 database migrations
- [x] CF Queue configuration
- [x] CF KV caching
- [x] CF Pages deployment
- [x] Environment variable management
- [x] Node.js adapter (local dev, VPS, Docker)
- [x] Docker Compose setup

---

## Milestone: SaaS MVP (April 2026)

**Status:** COMPLETE ✅

**Goals:**
- Prove multi-tenant architecture works
- Validate product-market fit with early users
- Establish baseline performance & cost metrics

**Completed:**
- All Phase 1–9 items above
- Production-ready API layer
- Secure tenant isolation
- Billing integration
- Full-stack deployment

**Known Limitations:**
- No test suite (integration tests run in production)
- No analytics dashboard (basic run history only)
- No advanced scheduling (cron only, no one-off triggers)
- No API key auth (session cookies only)
- No webhooks for external systems

---

## Next Phase: Early Access (May 2026)

**Goals:** Onboard 50 beta users, gather product feedback

**Work Items:**

### 1. Quality Assurance
- [ ] Write unit tests for core engine
- [ ] Write integration tests for API routes
- [ ] Load test CF Workers (target: 1k concurrent users)
- [ ] Chaos test (simulate source failures, network drops)
- [ ] Security audit (penetration testing)

### 2. Observability
- [ ] Add error tracking (Sentry)
- [ ] Add analytics (Plausible, no third-party cookies)
- [ ] Dashboard metrics (run success rate, avg articles, cost)
- [ ] Cron health monitoring
- [ ] Alert system (failed runs, high error rate)

### 3. Developer Experience
- [ ] REST API documentation (OpenAPI spec)
- [ ] Webhook system (POST events to user URLs)
- [ ] API key authentication (in addition to session)
- [ ] Rate limit headers (X-RateLimit-*)
- [ ] Audit logs (user actions, API calls)

### 4. Product Features
- [ ] Advanced scheduling (one-off runs, flexible cron)
- [ ] Stream templates (pre-configured bundles)
- [ ] Custom middleware library
- [ ] URL shortener integration
- [ ] Discord bot commands (trigger runs)

### 5. UX Improvements
- [ ] Mobile-responsive dashboard
- [ ] Dark mode
- [ ] Drag-and-drop stream builder
- [ ] Config file export/import (YAML)
- [ ] Run preview (see articles before sending)

---

## Phase 10: API Key Authentication

**Rationale:** Enable programmatic access, webhook receivers

**Work:**

```javascript
// User generates API key (in dashboard)
POST /api/keys
→ Response: { key: "sk_live_...", created: "2026-05-01" }

// Key stored in D1 (hashed)
table api_keys {
  id, user_id, key_hash, name, last_used_at, created_at
}

// API call with key
curl -H "Authorization: Bearer sk_live_..." https://api.newsengine.app/api/streams

// Middleware extracts user_id from key instead of session
function authenticateApiKey(req) {
  const auth = req.header('Authorization');
  const key = auth.replace('Bearer ', '');
  const user = db.prepare('SELECT user_id FROM api_keys WHERE key_hash = ?')
    .bind(hash(key)).first();
  return user?.user_id;
}
```

**Files to create:**
- `src/api/routes/api-keys.js` — CRUD for keys
- `src/api/services/api-key-service.js` — D1 operations
- `src/api/middleware/api-key-auth.js` — Key verification

---

## Phase 11: Webhook System

**Rationale:** Enable external integrations (Zapier, IFTTT, custom apps)

**Events:**
- `stream.created`, `stream.updated`, `stream.deleted`
- `run.completed`, `run.failed`
- `subscription.changed`

**Work:**

```javascript
// User subscribes to events
POST /api/webhooks
body: {
  url: "https://example.com/newsengine-hook",
  events: ["run.completed", "run.failed"],
  retryPolicy: "exponential"
}

// On event, POST to webhook
POST https://example.com/newsengine-hook
header: X-NewsEngine-Signature: sha256=...
body: {
  event: "run.completed",
  data: {
    runId: "...",
    streamId: "...",
    articlesCount: 42,
    completedAt: "2026-05-01T12:34:56Z"
  }
}

// Automatic retry (5 attempts, exponential backoff)
// Webhook delivery logs in D1 for debugging
```

**Files to create:**
- `src/api/routes/webhooks.js`
- `src/api/services/webhook-service.js`
- `src/api/services/webhook-delivery.js` (enqueue deliveries)

---

## Phase 12: Advanced Scheduling

**Rationale:** Move beyond cron (one-off runs, complex schedules)

**Concepts:**

```javascript
// Current: cron-only
{
  schedule: "0 7 * * *"  // Daily at 7 AM
}

// Future: flexible
{
  schedule: {
    type: "cron",
    expression: "0 7,19 * * *"  // 7 AM & 7 PM daily
  },
  // OR
  schedule: {
    type: "interval",
    every: 6,
    unit: "hours"  // Every 6 hours
  },
  // OR
  schedule: {
    type: "weekly",
    days: ["mon", "wed", "fri"],
    time: "09:00"  // 9 AM on MWF
  }
}

// One-off run
POST /api/streams/:id/run?now=true
→ Triggers immediately (queued)
```

**Files to modify:**
- `src/api/validators/stream-config.js` — Enhance schema
- `src/api/services/cron-helper.js` — Support flexible schedules

---

## Phase 13: Stream Templates & Presets

**Rationale:** Onboard new users faster

**Concept:**

```javascript
// User selects preset during signup
GET /api/templates
→ [
  { id: "tech-blogs", name: "Tech News Digest", sources: [...], ai: {...} },
  { id: "startup-news", name: "Startup Updates", sources: [...], ai: {...} },
  { id: "ai-research", name: "AI Research Papers", sources: [...], ai: {...} },
]

// User creates stream from template
POST /api/streams/from-template
body: { templateId: "tech-blogs", name: "My Tech Digest" }
→ Creates stream with pre-filled config
```

**Work:**
- [ ] Design 10 templates (tech, startup, AI, security, web dev, etc.)
- [ ] Store templates in D1 or code
- [ ] Expose via API
- [ ] Update dashboard wizard to offer templates

---

## Phase 14: Custom Middleware Library

**Rationale:** Enable users to filter/transform content without code

**Concept:**

```javascript
// Middleware as middleware config in stream
{
  sources: [...],
  middleware: [
    {
      type: "keyword-filter",
      keywords: ["kubernetes", "docker", "terraform"],
      mode: "include"  // Only articles matching these keywords
    },
    {
      type: "language-filter",
      languages: ["en"]  // Skip non-English articles
    },
    {
      type: "min-engagement",
      minHNPoints: 100,
      minRedditUpvotes: 50
    },
    {
      type: "dedup",
      threshold: 0.7  // Skip similar articles
    }
  ]
}
```

**Implementation:**
- [ ] Middleware definitions in D1 (type + params)
- [ ] Factory function to instantiate at runtime
- [ ] Load from stream config in executor
- [ ] Dashboard UI for middleware builder

---

## Phase 15: URL Shortener Integration

**Rationale:** Track clicks, provide analytics

**Concept:**

```javascript
// On stream creation, user selects shortener
{
  outputs: [...],
  shortener: {
    provider: "bit.ly",
    token: "...",
    domain: "news.example.com"
  }
}

// On send to output, shorten article URLs
article.url = "https://extremely-long-url.example.com/article/123"
→ shortened to "https://news.example.com/abc123"

// Provide click analytics in dashboard
GET /api/streams/:id/analytics
→ {
  clicks: { "abc123": 42, ... },
  topArticles: [...]
}
```

**Integrations:**
- [x] Bit.ly (API v4)
- [ ] TinyURL
- [ ] Custom domain shortener

---

## Phase 16: Mobile Dashboard

**Rationale:** On-the-go monitoring

**Work:**
- [ ] Responsive design (tablets, phones)
- [ ] Swipe navigation
- [ ] Push notifications (browser + mobile)
- [ ] Mobile-specific optimizations (smaller bundles)

---

## Long-Term Vision (2027+)

### 1. Community Marketplace
- Share stream configs as templates
- Community AI prompt library
- Plugin registry for custom sources/outputs

### 2. Enterprise Features
- SSO (SAML, OIDC)
- Role-based access control (RBAC)
- Team management
- Audit logs
- SLA monitoring

### 3. Self-Hosting
- Docker image with local D1
- All-in-one binary
- License management

### 4. Integrations
- Zapier action (receive events)
- n8n workflow builder
- Make.com scenarios

### 5. AI Features
- Feed summarization ranking (not just filtering)
- Semantic search across runs
- Anomaly detection (unusual news spike)
- User preference learning

---

## Success Metrics

### User Metrics
- Signups: 50 → 500 → 5,000
- MAU (monthly active users): 20% of signups
- Churn rate: <5% month-over-month

### Product Metrics
- Avg streams per user: 2.5
- Avg sources per stream: 4
- Avg outputs per stream: 2
- Run success rate: >98%

### Business Metrics
- ARPU (average revenue per user): $25 → $50
- CAC (customer acquisition cost): <$20
- LTV:CAC ratio: >3:1
- Conversion rate (free → paid): 10%

---

## Risk & Mitigation

| Risk | Impact | Mitigation |
|------|--------|-----------|
| AI cost explosion | Could break unit economics | Implement token limits, cache responses, offer offline AI (Ollama) |
| Source uptime | Users see stale data | Fallback sources, retry with exponential backoff |
| CF Workers limit (30s) | Can't handle slow sources | Move slow sources to background job queue |
| Polar billing issues | Revenue loss | Use Stripe as fallback provider |
| Security breach | Data loss, reputation damage | Pen testing, SOC 2 audit, encrypted secrets |
| Competitor (Make, Zapier) | Market share loss | Focus on news domain expertise, stay nimble |

---

## Deployment Timeline

| Date | Milestone | Status |
|------|-----------|--------|
| Feb 2026 | Core engine + basic outputs | ✅ DONE |
| Mar 2026 | Multi-channel (X, FB, Threads) | ✅ DONE |
| Apr 2026 | SaaS API + auth + billing | ✅ DONE |
| May 2026 | Early access (50 users) | 🔄 IN PROGRESS |
| Jun 2026 | Public beta (500 users) | ⏳ PLANNED |
| Jul 2026 | GA + marketing push | ⏳ PLANNED |
| Aug 2026 | Phase 10: API keys | ⏳ PLANNED |
| Sep 2026 | Phase 11: Webhooks | ⏳ PLANNED |
| Oct 2026 | Phase 12: Advanced scheduling | ⏳ PLANNED |

---

## Questions & Decisions Needed

1. **Analytics:** Use Sentry (privacy-focused) or PostHog (more features)?
2. **Stripe vs Polar:** Keep Polar solo or add Stripe as backup?
3. **Custom domain shortener:** Build or use third-party (Bit.ly)?
4. **Self-hosting:** Provide Docker image or wait until Phase 3?
5. **Mobile app:** Native (iOS/Android) or PWA?
