# NewsEngine Documentation Index

Welcome to NewsEngine SaaS documentation. Start here to navigate all technical and product documentation.

**Last updated:** April 17, 2026

---

## Quick Navigation

### For New Developers
1. **[Codebase Summary](./codebase-summary.md)** — Directory structure, module overview, file reference
2. **[Code Standards](./code-standards.md)** — Naming conventions, patterns, testing, security guidelines
3. **[System Architecture](./system-architecture.md)** — Data flows, deployment, scaling, security model

### For Product/Business
1. **[Project Overview & PDR](./project-overview-pdr.md)** — Vision, goals, business model, success metrics
2. **[Project Roadmap](./project-roadmap.md)** — Completed phases, next phases, timelines, backlog

### For Operations/DevOps
1. **[System Architecture](./system-architecture.md)** — Infrastructure, deployment, monitoring
2. **[Code Standards](./code-standards.md)** — Performance guidelines, security checklist

---

## Document Guide

### 📋 Project Overview & PDR (`project-overview-pdr.md`)
**Audience:** Product managers, business stakeholders, new team members

**Contains:**
- Executive summary (what is NewsEngine, why it matters)
- Vision & goals (2026 targets, long-term direction)
- Product definition (features, roadmap)
- Business model (pricing, unit economics)
- Functional & non-functional requirements
- Success metrics & KPIs
- Risks & mitigation strategies
- Go-to-market strategy
- Open questions & design decisions

**When to read:** First time understanding the project, making product decisions, investor/stakeholder briefing

---

### 📚 Codebase Summary (`codebase-summary.md`)
**Audience:** Developers, architects, code reviewers

**Contains:**
- Complete directory structure with descriptions
- Key components overview (engine, API, sources, AI, outputs, channels)
- Plugin contracts & Article schema
- Core services & their responsibilities
- Dependencies list
- Environment variables reference
- Deployment options
- Architecture patterns (plugin system, fluent builder, pipeline middleware, tenant isolation, queue-based execution)
- File size guidelines & key files to know

**When to read:** Onboarding to codebase, understanding module responsibilities, architectural decisions

---

### 🏗️ System Architecture (`system-architecture.md`)
**Audience:** Backend engineers, architects, DevOps

**Contains:**
- High-level system diagram
- Data flow walkthrough (user creates stream → scheduled execution → queue processing → run history)
- Tenant isolation security model
- Billing & subscription architecture
- Multi-channel (OAuth token management)
- Cache strategy (CF KV article deduplication)
- Error handling & resilience patterns
- Deployment architecture (CF Workers, Node.js, Dashboard)
- Performance characteristics & scalability considerations
- Security checklist

**When to read:** Understanding system design, implementing new features, debugging production issues, capacity planning

---

### 🛣️ Project Roadmap (`project-roadmap.md`)
**Audience:** Product managers, engineers, stakeholders

**Contains:**
- Current status (SaaS MVP v2.0 complete)
- All completed phases (1–9)
- Next phases (10–16) with detailed requirements:
  - Phase 10: API key authentication
  - Phase 11: Webhook system
  - Phase 12: Advanced scheduling
  - Phase 13: Stream templates
  - Phase 14: Custom middleware library
  - Phase 15: URL shortener integration
  - Phase 16: Mobile dashboard
- Long-term vision (marketplace, enterprise, self-hosting)
- Success metrics
- Risk & mitigation
- Deployment timeline (Feb 2026 – ongoing)
- Open questions

**When to read:** Feature prioritization, capacity planning, investor updates, understanding what's next

---

### 📖 Code Standards (`code-standards.md`)
**Audience:** All developers

**Contains:**
- Language & runtime guidelines (ES Modules, Node 18+)
- Naming conventions (kebab-case files, camelCase functions, PascalCase classes)
- Code structure (module organization, file size limits, function size)
- Error handling patterns (try/catch strategy, error messages, logging)
- API design (request/response format, Hono handlers, validation)
- Database best practices (parameterized queries, user_id scoping, indexes)
- Middleware patterns
- Testing strategy (unit, integration, current status)
- Type annotations (JSDoc)
- Configuration management
- Git & commits (conventional commits, branch naming)
- Performance guidelines (concurrency limits, CF Workers limits, query optimization)
- Security (secrets, SQL injection, CORS, auth checks)
- Documentation (code comments, JSDoc, README updates)
- Linting & formatting

**When to read:** Before implementing features, code reviews, onboarding new developers

---

## Key Concepts

### Plugin System

Everything in NewsEngine is a plugin extending one of 4 abstract base classes:

```javascript
SourcePlugin     → .fetch(options) → Article[]
AIPlugin         → .summarize(articles, options) → {text, usage, model}
OutputPlugin     → .send(content, options) → {success, messageId, error}
CachePlugin      → .get(key), .set(key, value, ttl), .has(key), .delete(key)
```

No plugins depend on other plugins. All wiring happens in user code or adapters.

### Multi-Tenant Architecture

Every API route is scoped to `user_id`:
- D1 queries enforce `WHERE user_id = ?`
- Sessions map to users via Better Auth
- Secrets masked in API responses
- Billing per user via Polar

### Fluent Builder API

```javascript
new NewsEngine()
  .addSource(source1, source2)
  .useAI(claude)
  .addOutput(telegram, slack)
  .useCache(cloudflareKV)
  .configure({ language: 'vi', style: 'digest' })
  .run();
```

All methods are chainable and return `this`.

### Queue-Based Execution

- Crons trigger producer → enqueues jobs to CF Queue
- Consumer dequeues & executes NewsEngine pipeline
- Auto-retry (3x), then dead-letter queue
- Execution decoupled from scheduling

### Billing Model

- **Free:** 3 streams, basic sources, Groq AI, Telegram only
- **Pro:** 20 streams, all sources, Claude/GPT, all outputs ($29/mo)
- **Business:** Unlimited, custom features (custom pricing)

---

## Common Tasks

### Adding a New Data Source

1. Create `src/sources/my-source.js`
2. Extend `SourcePlugin`, implement `async fetch(options)`
3. Return `Article[]` matching schema
4. Export from `src/sources/index.js`
5. Add tests in `test/sources/my-source.test.js`
6. Document in [Codebase Summary](./codebase-summary.md)

**Reference:** `src/sources/rss.js` (simple), `src/sources/hackernews.js` (API-based)

### Adding a New AI Provider

1. If OpenAI-compatible: add factory helper in `src/ai/openai-compat.js`
2. If custom API: create `src/ai/my-ai.js`, extend `AIPlugin`
3. Implement `async summarize(articles, options)`
4. Use `buildPrompt()` from `_prompts.js` for consistent formatting
5. Export from `src/ai/index.js`
6. Register in `src/ai/create-ai.js` factory

**Reference:** `src/ai/claude.js` (native), `src/ai/openai-compat.js` (compatible)

### Adding a New Output Channel

1. Create class extending `OutputPlugin` in `src/outputs/channels.js` or new file
2. Implement `get id`, `get name`, `get maxLength`, `async send(content)`
3. Engine auto-truncates to `maxLength` before calling `send()`
4. If multi-account (like Telegram): store tokens in `src/utils/token-store.js`
5. Export from `src/outputs/index.js`

**Reference:** `src/outputs/telegram.js` (simple), `src/channels/x-channel.js` (OAuth)

### Adding a New API Route

1. Create `src/api/routes/my-feature.js` with Hono router
2. Import services from `src/api/services/`
3. All handlers receive `c.env` (CF bindings), `c.get('userId')` (from auth)
4. Return `c.json({ data: ... }, status)` or `c.json({ error: ... }, status)`
5. Export from route file
6. Mount in `src/api/app.js`: `app.route('/api/my-feature', routes)`

**Reference:** `src/api/routes/streams.js`, `src/api/routes/runs.js`

### Deploying to Cloudflare

```bash
# First time setup
wrangler d1 create newsengine-db
wrangler d1 migrations apply newsengine-db

# Deploy
wrangler deploy

# View logs
wrangler tail
```

See `wrangler.toml` for configuration.

### Running Locally

```bash
# Start CF Workers (with local D1)
npm run dev

# Or run Node adapter
npm start                 # One-time run
npm run start:cron       # Daemon mode
npm run preview          # Dry run
```

---

## Performance & Scalability

### Current Limits

| Metric | Value | Notes |
|--------|-------|-------|
| CF Worker timeout | 30 seconds | Use queue for longer jobs |
| CF Worker memory | 128 MB | Keep code lean |
| D1 database size | 10 GB | Expand if needed |
| Concurrent streams | 10,000+ | Queue batches by default |
| API rate limit | 120 req/min/user | Fair usage |

### Optimization Tips

1. **Fetch optimization:** Use concurrency limits (5 default), add batch delays (500ms)
2. **AI cost:** Cache responses, set token limits, offer offline options
3. **Database:** Use indexes on frequently filtered columns (user_id, active, next_run_at)
4. **Cache strategy:** Article dedup via CF KV (30-day TTL), warm cache for popular sources

---

## Security Checklist

- [x] All API routes require authentication (Better Auth)
- [x] User_id scoping on every database query
- [x] Secrets masked in API responses (token***, URL***)
- [x] Rate limiting on auth (60/min) & API (120/min) routes
- [x] CORS configured for CF Pages origin only
- [x] Better Auth handles password hashing (bcrypt)
- [x] OAuth tokens stored securely in D1
- [x] Webhook signature verification (Polar)
- [ ] SQL injection prevention (parameterized queries ✓, add input validation)
- [x] HTTPS enforced (CF auto)
- [x] CSRF protection (cookie SameSite=Strict)

**For production:** Add penetration test, SOC 2 audit, data encryption at rest.

---

## Monitoring & Alerts

### Key Metrics to Track

```sql
-- Daily signups
SELECT DATE(created_at), COUNT(*) FROM "user" GROUP BY DATE(created_at);

-- Subscription breakdown
SELECT plan, COUNT(*) FROM "user" GROUP BY plan;

-- Run success rate (last 7 days)
SELECT status, COUNT(*) FROM run_history 
WHERE ran_at > UNIX_TIMESTAMP(NOW()) - 604800 
GROUP BY status;

-- API error rate
SELECT COUNT(*) FROM logs WHERE level='error' AND timestamp > NOW() - INTERVAL 1 HOUR;
```

### Alert Thresholds

- Run success rate <95% → PagerDuty page
- API error rate >1% → Slack #alerts
- D1 query p95 >100ms → Investigate
- Signup drop >50% MoM → Product review

---

## Contributing

### Pre-Commit Checklist

- [ ] Code runs (no syntax errors)
- [ ] Tests pass (if applicable)
- [ ] ESLint passes
- [ ] No secrets in commit
- [ ] Commit message follows convention (feat/fix/docs/refactor)
- [ ] Branch name is descriptive (feature/*, fix/*, docs/*)

### Pull Request Process

1. Create feature branch from `master`
2. Implement & test
3. Create PR with detailed description
4. Request code review
5. Merge when approved
6. Deploy to production

### Commit Message Format

```
feat(streams): add stream template system
fix(auth): prevent session fixation attacks
docs(api): update authentication guide
refactor(engine): simplify deduplication logic
test(sources): add RSS parser tests
```

Format: `type(scope): message`

---

## FAQ

**Q: Can I use NewsEngine without SaaS?**
A: Yes! The core engine is open-source-ready. You can use it locally with Node.js or self-host on your own server.

**Q: What AI models are supported?**
A: Claude, GPT-4, Groq (free), Gemini, Ollama (local), OpenRouter, Together AI. Add your own by extending `AIPlugin`.

**Q: How much does it cost to run?**
A: ~$0.005 per run. At 1,000 runs/day = $150/month infrastructure + AI costs.

**Q: Can I switch AI providers mid-stream?**
A: Yes! Edit the stream config, select a new AI provider. Next run uses the new provider.

**Q: How often can streams run?**
A: Every minute (via cron `* * * * *`). Practical limit: every 30 minutes (avoid DoS-ing sources).

**Q: Is there a webhook system?**
A: Not yet (Phase 11). Currently only supported via manual integration or CF Queue events.

**Q: Can I self-host?**
A: Not yet. Planned for Phase 3. Currently SaaS-only or Node.js/Docker on your own infra.

---

## Getting Help

### For Questions About...

| Topic | Resource |
|-------|----------|
| Architecture decisions | [System Architecture](./system-architecture.md), [Code Standards](./code-standards.md) |
| Implementing features | [Project Roadmap](./project-roadmap.md), corresponding phase file |
| Adding plugins | [Codebase Summary](./codebase-summary.md) — "Working With This Codebase" section |
| Deploying | [Codebase Summary](./codebase-summary.md) — "Deployment" section |
| Business/product strategy | [Project Overview & PDR](./project-overview-pdr.md) |

---

## Document Maintenance

**Who updates docs:**
- Dan (solo developer) — all sections

**When to update docs:**
- After implementing new features
- After architectural decisions
- After completing phases
- Before external communication (investor pitches, public launch)

**How to update docs:**
1. Read the relevant doc sections
2. Verify against actual code implementation
3. Update with new information
4. Keep files under 800 LOC (split if needed)
5. Commit docs changes with code: `docs: update X in project roadmap`

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | Apr 17, 2026 | Complete SaaS MVP documentation |
| 0.5 | Apr 10, 2026 | Architecture & code standards |
| 0.1 | Apr 1, 2026 | Initial documentation structure |

---

**Last reviewed:** April 17, 2026  
**Next review:** May 17, 2026 (after early access beta)
