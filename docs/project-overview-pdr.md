# Project Overview & PDR — NewsEngine SaaS

**Last updated:** April 17, 2026  
**Status:** SaaS MVP (v2.0) — COMPLETE  
**Team:** Solo developer (Dan)

---

## Executive Summary

**NewsEngine** is a plugin-based, SaaS news aggregation platform that enables users to:
1. **Aggregate** articles from multiple data sources (RSS, APIs, web scraping)
2. **Summarize** content with any AI model (Claude, GPT, Groq, Ollama, etc.)
3. **Distribute** automatically to any output channel (Telegram, Slack, Discord, Email, X/Twitter, Facebook, Threads)
4. **Control** via self-serve web dashboard with billing integration

**Key differentiator:** Zero lock-in through swappable plugins. Users can change AI providers, swap output channels, or self-host without vendor dependency.

**Business model:** SaaS with Polar billing (Free, Pro, Business tiers). Target: news enthusiasts, dev teams, content curators.

---

## Vision & Goals

### Long-term Vision (2027+)

NewsEngine becomes the **composable infrastructure layer for content distribution**:
- Users can "mix and match" sources, AI, and outputs like building blocks
- Community marketplace for templates, prompts, plugins
- Enterprise features (SSO, team collaboration, audit logs)
- Self-hosting option for on-premise deployment

### 2026 Goals (this year)

1. ✅ **Validate MVP with early users** (50 beta users, April–May)
2. ✅ **Prove multi-tenant architecture works** (D1 + CF Workers)
3. ✅ **Establish billing unit economics** (Polar integration)
4. 🔄 **Public beta launch** (500 users, June)
5. ⏳ **General availability** (July, marketing push)

---

## Product Definition

### Core Features (SaaS MVP)

| Feature | Status | Details |
|---------|--------|---------|
| Stream creation & management | ✅ DONE | CRUD API, dashboard UI |
| Multi-source aggregation | ✅ DONE | 6 sources (RSS, HN, Reddit, Dev.to, GitHub, HTML scraper) |
| AI summarization | ✅ DONE | Claude, OpenAI, Groq, Gemini, Ollama, Together |
| Multi-output distribution | ✅ DONE | Telegram, Slack, Discord, Email, Webhook, Markdown, X, Facebook, Threads |
| Queue-based execution | ✅ DONE | CF Queues with auto-retry |
| Cron scheduling | ✅ DONE | Flexible cron expressions |
| Email/password signup | ✅ DONE | Better Auth integration |
| Google OAuth | ✅ DONE | Social login |
| Billing & subscriptions | ✅ DONE | Polar.sh integration |
| Dashboard UI | ✅ DONE | Preact SPA on CF Pages |
| Run history & logs | ✅ DONE | Execution tracking |

### Future Features (Post-MVP)

| Feature | Phase | Priority |
|---------|-------|----------|
| API key authentication | 10 | High |
| Webhook system | 11 | High |
| Advanced scheduling | 12 | Medium |
| Stream templates | 13 | Medium |
| Custom middleware | 14 | Medium |
| Analytics dashboard | TBD | High |
| Mobile app (PWA) | TBD | Low |
| Self-hosting | TBD | Medium |

---

## Technical Architecture

### Deployment Model

**Primary:** Cloudflare Workers (global, serverless, auto-scaling)
**Secondary:** Node.js adapter (local, VPS, Docker)

**Infrastructure:**
```
┌─────────────────────────────────────┐
│ Cloudflare Workers (API)            │
│ ├─ D1 (SQLite database)             │
│ ├─ CF Queues (job execution)        │
│ ├─ CF KV (article cache)            │
│ └─ Cron triggers (scheduling)       │
└─────────────────────────────────────┘
         ↓
┌─────────────────────────────────────┐
│ Cloudflare Pages (Dashboard SPA)    │
└─────────────────────────────────────┘
         ↓
┌─────────────────────────────────────┐
│ External Services                   │
│ ├─ Polar.sh (billing)               │
│ ├─ Google (OAuth)                   │
│ └─ News sources (APIs, RSS)         │
└─────────────────────────────────────┘
```

### Technology Stack

**Backend:**
- Hono 4.12.14 (lightweight web framework)
- Better Auth 1.6.5 (authentication)
- D1 SQLite (database)
- CF Queues (background jobs)
- CF KV (caching)

**Frontend:**
- Preact (lightweight React)
- Plain CSS (no framework)
- Server-Sent Events (live updates)

**Billing:**
- Polar.sh SDK (payment processing)
- D1 tables (subscription tracking)

**Core:**
- Zero external dependencies for engine (fetch native)
- Node.js 18+ compatible
- ES Modules only

---

## Business Model

### Pricing Tiers

| Tier | Streams | Sources | AI | Outputs | Price |
|------|---------|---------|----|---------:|------:|
| **Free** | 3 | Basic (RSS, HN, Reddit) | Groq free | Telegram | $0 |
| **Pro** | 20 | All 6 | Claude, GPT-4 | All | $29/mo |
| **Business** | ∞ | All + custom | All + local | All | Custom |

### Revenue Model

- **Freemium:** Free tier → conversion funnel
- **Subscription:** Monthly $29 (Pro), custom Business
- **Expansion:** +$10 per additional 10 streams (future)

### Unit Economics (Projected)

**Assumptions:**
- CAC (customer acquisition cost): $20
- Conversion rate: 10% (free → paid)
- Avg subscription value: $25/mo
- Churn: 5%/mo

**LTV calculation:**
```
Monthly revenue per user = $25
Monthly churn = 5%
LTV = $25 / 0.05 = $500

LTV:CAC ratio = $500 / $20 = 25:1 ✅ (healthy)
```

**Cost per run:**
- Source fetching: ~$0.00001 (mostly free APIs)
- AI summarization: $0.005 (Claude Sonnet ~500 tokens)
- Output delivery: ~$0.0001 (mostly free APIs)
- Infrastructure: $0.0001 (CF Workers + D1)
- **Total per run:** ~$0.0052

**At 500 users, 2.5 streams/user, 1 run/day:**
- 1,250 runs/day = 37,500 runs/mo
- Cost: ~$195/mo
- Revenue: $25 × 10% × 500 = $1,250/mo
- **Margin:** ~84% ✅

---

## Functional Requirements (SaaS MVP)

### FR1: User Management
- [x] Email/password signup with email verification
- [x] Google OAuth social login
- [x] User profile management (name, email, picture)
- [x] Session management (cookie-based, 30-day expiry)
- [x] Password reset flow (future)

**Acceptance Criteria:**
- User can sign up via email in <2 minutes
- User can login with Google account
- Session persists across browser closes
- Only authenticated users can access dashboard

### FR2: Stream Management
- [x] Create new stream with name & config
- [x] Edit stream (name, sources, AI, outputs, schedule)
- [x] List all user streams (paginated)
- [x] View stream details & execution logs
- [x] Toggle stream active/inactive
- [x] Delete stream

**Acceptance Criteria:**
- User can create stream with valid config in <5 minutes
- Stream config validated before save
- User sees "validation failed" error with field-level hints
- User can enable/disable stream without deleting

### FR3: Stream Execution
- [x] Automatic execution on schedule (cron)
- [x] Manual trigger (run now)
- [x] Fetch articles from configured sources
- [x] Deduplicate articles (cache check)
- [x] Summarize with AI
- [x] Send to all outputs in parallel
- [x] Log run result (success/error, articles count)

**Acceptance Criteria:**
- Stream executes at scheduled time (±5 min)
- If source fails, continue with others
- If AI fails, run marked as error
- Run history visible in dashboard within 30 seconds
- Failed runs auto-retry (3x) via CF Queue

### FR4: Billing & Subscriptions
- [x] Create Polar customer on signup
- [x] Display available plans in dashboard
- [x] Create subscription via Polar checkout
- [x] Sync subscription status (webhook)
- [x] Enforce tier limits (stream count, output types)
- [x] Display upgrade prompts when limit exceeded

**Acceptance Criteria:**
- Free user limited to 3 streams (enforced in API)
- Free user can only use Telegram output
- Pro user can create 20 streams
- Subscription state updates within 10 seconds of payment
- Canceling subscription removes Pro features (next month)

### FR5: Dashboard UI
- [x] Landing page with product pitch
- [x] Signup/login pages
- [x] Onboarding wizard (stream creation guide)
- [x] Stream list view (sortable, searchable)
- [x] Stream detail view (edit config)
- [x] Stream builder (visual source/output selection)
- [x] Run history timeline
- [x] Billing page (plan info, Polar portal link)
- [x] Error log viewer

**Acceptance Criteria:**
- Dashboard loads in <2 seconds
- Stream builder works on mobile (responsive)
- User can create stream without coding
- Run history shows last 50 executions

---

## Non-Functional Requirements (SaaS MVP)

### NFR1: Performance
- **API latency:** <100ms p95 (auth routes), <50ms p95 (CRUD)
- **Stream execution:** <60 seconds (fetch + AI + send)
- **Dashboard load:** <2 seconds
- **Database query:** <10ms p95

**Test:** Load test 1,000 concurrent users

### NFR2: Reliability
- **Uptime SLA:** 99.5% (best-effort)
- **Source fetch retry:** 3 retries with exponential backoff
- **Queue retry:** Auto-retry failed jobs 3x, then DLQ
- **Data durability:** D1 replication, automated backups

**Test:** Simulate source failures, network drops

### NFR3: Scalability
- **Concurrent streams:** 10,000+ without degradation
- **Concurrent users:** 1,000+ simultaneous
- **Queue throughput:** 1,000 jobs/second
- **Database:** <500ms query p95 at 100GB data

**Test:** Gradual load ramp to 1,000 concurrent users

### NFR4: Security
- **Auth:** Password hashing (bcrypt), session tokens (random)
- **Data:** Tenant isolation (user_id scoping), encrypted at rest (CF)
- **API:** Rate limiting, CORS restricted, HTTPS enforced
- **Secrets:** Masked in API responses, never logged

**Test:** Penetration test, OWASP Top 10 audit

### NFR5: Maintainability
- **Code quality:** <200 LOC per module, JSDoc for APIs
- **Test coverage:** >70% core engine, >50% API
- **Documentation:** Codebase summary, architecture diagrams, runbooks
- **Deployment:** Single `wrangler deploy` command

**Test:** Onboard new dev in <1 hour

### NFR6: User Experience
- **Onboarding:** <5 minutes from signup to first run
- **Learning curve:** No coding required
- **Error messages:** Clear, actionable, field-level hints
- **Accessibility:** WCAG 2.1 AA (dashboard)

**Test:** Usability test with 5 new users

---

## Constraints & Dependencies

### Technical Constraints

1. **CF Workers limits:**
   - 30-second execution timeout (use queue for long jobs)
   - 128 MB memory (lean code)
   - 100 MB request/response size

2. **D1 limits:**
   - 10 GB database size (expand if needed)
   - Read/write rate limits (mostly not hit)
   - No async triggers (use queue for side effects)

3. **CF KV limits:**
   - 1 KB value size per key (compress if needed)
   - 1 second read/write latency globally
   - 30-day max TTL (no permanent cache)

### Dependencies

**Critical (production-blocking):**
- Cloudflare account (API keys, D1, Queue, KV, Pages)
- Polar account (billing processor)
- Google OAuth credentials (for social login)

**Important (nice-to-have):**
- Sentry account (error tracking)
- Slack webhook (alerts)
- GitHub repo (versioning)

**Optional:**
- Custom domain (DNS)
- Email provider (SendGrid, Resend for Email output)

---

## Success Metrics

### User Adoption
- **Signups:** 50 (MVP) → 500 (beta) → 5,000 (GA) by Dec 2026
- **Active users (MAU):** 20% of signups
- **Retention:** 70% 1-month retention, 50% 3-month
- **Churn:** <5% monthly

### Product Quality
- **Run success rate:** >98%
- **API uptime:** >99.5%
- **Dashboard performance:** <2s load time, p95
- **Customer satisfaction:** NPS >40

### Business Metrics
- **ARPU (avg revenue/user):** $5 (at 10% conversion)
- **CAC:** <$20
- **LTV:CAC:** >5:1
- **Conversion rate:** 10% (free → paid)
- **Monthly recurring revenue (MRR):** $25k (500 users @ 10% × $25)

### Engagement
- **Avg streams per user:** 2.5
- **Avg sources per stream:** 4
- **Avg outputs per stream:** 2
- **Run frequency:** 1.5 runs/day/user

---

## Risks & Mitigation

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|-----------|
| AI API cost exceeds margin | Revenue loss | Medium | Cache responses, offer offline AI (Ollama), set token limits |
| Source API downtime | Failed runs | High | Implement fallback sources, retry logic |
| Competitor (Make, Zapier) | Market share | Medium | Focus on news domain, stay nimble, build community |
| Security breach | Reputation, legal | Low | Pen testing, SOC 2 audit, encrypted secrets, rate limiting |
| CF Workers limits hit | Scalability blocker | Low | Migrate to Durable Objects or run on own servers |
| Polar integration issues | Billing broken | Low | Add Stripe as fallback, manual subscription tracking |

---

## Implementation Phases

### Phase 1: Core Engine ✅
**Duration:** Jan–Feb 2026 (6 weeks)
- NewsEngine orchestrator
- Plugin system (contracts, registry)
- 6 sources, 2 AI providers, 6 outputs
- Cache layer (Memory, File, Redis, CF KV)
- **Outcome:** Standalone library, usable as npm package

### Phase 2: Multi-Channel ✅
**Duration:** Mar 2026 (4 weeks)
- Channel abstraction (OAuth, token management)
- X/Twitter integration
- Facebook Pages integration
- Threads integration
- **Outcome:** 4 additional output channels with auth

### Phase 3–9: SaaS MVP ✅
**Duration:** Apr 2026 (4 weeks)
- Hono API layer
- Better Auth + Polar billing
- D1 database schema
- CF Queue execution
- Dashboard UI
- Landing page
- **Outcome:** Full-stack SaaS product

### Phase 10+: Expansion 🔄
**Duration:** May–Dec 2026 (ongoing)
- API key auth, webhooks, advanced scheduling
- Analytics, mobile, self-hosting
- See [project-roadmap.md](./project-roadmap.md) for details

---

## Team & Responsibilities

**Current:** Solo developer (Dan)

**Handoff plan (if hiring):**
- **Backend lead:** API, database, queue system
- **Frontend lead:** Dashboard UI, onboarding
- **DevOps:** Infrastructure, monitoring, deployments
- **Product manager:** Feature prioritization, user research

---

## Go-to-Market Strategy

### Phase 1: Early Access (May 2026)
- Invite 50 beta users (Twitter, Product Hunt, Reddit)
- Gather feedback via surveys, user interviews
- Track NPS, retention, feature requests
- Fix top bugs, improve UX

### Phase 2: Public Beta (Jun 2026)
- Launch on Product Hunt
- Write 5 blog posts (use cases, tutorials)
- Reach out to news/dev communities
- Target: 500 signups
- Focus on activation (first stream creation)

### Phase 3: General Availability (Jul 2026)
- Marketing push (ads, sponsorships, partnerships)
- Case studies from beta users
- Tier simplification (if needed based on feedback)
- Target: 5,000 signups by end of year

### Channels
- **Product Hunt** (launch spotlight)
- **Twitter/X** (dev audience, news junkies)
- **Reddit** (r/programming, r/news, r/selfhosted)
- **Newsletter** (Dev.to, Substack)
- **Partnerships** (Zapier, Make, integrations)

---

## Monitoring & Observability

### Metrics to Track

**User metrics:**
```sql
SELECT DATE(created_at), COUNT(*) as new_signups
FROM "user"
GROUP BY DATE(created_at);

SELECT plan, COUNT(*) as users
FROM "user"
GROUP BY plan;
```

**Product metrics:**
```sql
SELECT status, COUNT(*) as runs, AVG(articles_count) as avg_articles
FROM run_history
WHERE ran_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
GROUP BY status;
```

**Business metrics:**
```sql
SELECT COUNT(*) as active_subs
FROM polar_subscription
WHERE status = 'active';
```

### Alerts

- Run success rate drops below 95% → PagerDuty
- API error rate >1% → Slack notification
- D1 query p95 >100ms → Investigation
- Signups drop 50% MoM → Product review

---

## Questions & Decisions

### Open Questions

1. **Analytics:** Use Sentry (privacy) or PostHog (features)?
   - **Recommendation:** Sentry (aligns with privacy-first positioning)

2. **Stripe vs Polar:** Polar solo or backup?
   - **Recommendation:** Polar solo initially, add Stripe if needed

3. **Self-hosting:** Timeline?
   - **Recommendation:** Phase 3+ (after proving SaaS works)

4. **Mobile:** Native app or PWA?
   - **Recommendation:** PWA (faster, cheaper, CF Pages friendly)

5. **Marketplace:** Community templates when?
   - **Recommendation:** Phase 2 (after 500 users)

### Design Decisions Made

| Decision | Rationale | Trade-off |
|----------|-----------|-----------|
| Hono instead of Express | CF Workers native, lightweight | Smaller ecosystem |
| Better Auth instead of Auth0 | Self-hosted, fewer moving parts | No enterprise SSO yet |
| Polar instead of Stripe | Aligns with open-source ethos | Smaller brand, less integrations |
| D1 instead of Postgres | Simplicity, no ops, CF native | Can't scale to 10GB+ |
| CF Queue instead of custom queue | Built-in, auto-scaling, durable | Less flexible than Bull |

---

## Document References

- [Codebase Summary](./codebase-summary.md) — Directory structure, module overview
- [System Architecture](./system-architecture.md) — Data flows, deployment, scaling
- [Project Roadmap](./project-roadmap.md) — Phases 10+, timelines, backlog
- [Code Standards](./code-standards.md) — Naming, patterns, testing, security

---

## Appendix: Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | Apr 17, 2026 | SaaS MVP complete, PDR documented |
| 0.9 | Apr 10, 2026 | Dashboard & billing integration |
| 0.8 | Apr 1, 2026 | API layer & multi-tenant streams |
| 0.7 | Mar 15, 2026 | Multi-channel (X, Facebook, Threads) |
| 0.1 | Feb 1, 2026 | Core engine & basic outputs |
