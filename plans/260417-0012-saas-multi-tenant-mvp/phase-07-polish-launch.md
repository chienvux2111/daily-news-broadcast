---
phase: 07
title: "Polish + Launch Prep"
status: complete
priority: P2
effort: 3d
---

# Phase 07: Polish + Launch Prep

## Context Links
- Parent: [plan.md](./plan.md)
- Depends on: All phases 01-06
- Blocks: None (final phase)

## Overview
Error handling, rate limiting, run history cleanup, testing, and production deployment. This phase hardens the MVP for real users and prepares the soft launch.

## Key Insights
- Rate limiting prevents abuse on free tier (no API key auth = open endpoints behind session)
- Run history cleanup is tier-aware: 7d (free), 30d (pro), 90d (business)
- User-visible error logs reduce support burden
- Manual E2E testing covers the critical path: signup → create stream → run → receive output
- CF Workers has built-in error tracking via `wrangler tail`

## Requirements

### Functional
- Rate limiting on auth + API endpoints
- User-visible error log page (filtered run_history with status='failed')
- Run history cleanup job (runs daily, deletes old records by tier)
- Error messages are user-friendly (no stack traces in API responses)
- Production deployment checklist complete

### Non-Functional
- API rate limits: 60 req/min (auth), 120 req/min (API), 10 stream creates/hour
- Cleanup job completes in <10s for 1000 users
- Zero downtime deployment

## Architecture

### Rate Limiting Strategy
```
Hono middleware → check KV counter → increment or reject

Key format: "rl:{userId}:{endpoint}:{minute}"
TTL: 60 seconds (auto-expire)
Storage: CF KV (NEWS_CACHE binding)
```

### Cleanup Job
```
Cron (daily, 3 AM UTC)
  → SELECT DISTINCT user_id FROM run_history
  → For each user: get plan → determine retention days
  → DELETE FROM run_history WHERE user_id = ? AND ran_at < ?
```

## Related Code Files

### Create
- `src/api/middleware/rate-limit.js` — KV-based rate limiter
- `src/api/services/cleanup-service.js` — run history retention cleanup
- `src/dashboard/public/pages/error-log.js` — failed runs view

### Modify
- `src/api/app.js` — apply rate limit middleware
- `src/adapters/cloudflare.js` — add cleanup cron trigger
- `wrangler.toml` — add daily cleanup cron
- `src/dashboard/public/app.js` — add error log page to router

## Implementation Steps

### 1. Create rate limit middleware (`src/api/middleware/rate-limit.js`)
```js
export function rateLimit({ max, windowSec = 60, keyFn }) {
  return async (c, next) => {
    const key = `rl:${keyFn(c)}:${Math.floor(Date.now() / (windowSec * 1000))}`;
    const current = parseInt(await c.env.NEWS_CACHE.get(key)) || 0;
    if (current >= max) return c.json({ error: 'Rate limit exceeded' }, 429);
    await c.env.NEWS_CACHE.put(key, String(current + 1), { expirationTtl: windowSec });
    await next();
  };
}
```

Apply:
- Auth routes: 60/min by IP
- API routes: 120/min by userId
- Stream create: 10/hour by userId
- Preview: 5/hour by userId

### 2. Sanitize error responses
In app.js error handler:
```js
app.onError((err, c) => {
  console.error(`[Error] ${c.req.path}: ${err.message}`);
  // Never expose stack traces or internal details
  return c.json({ error: 'Internal server error' }, 500);
});
```

For known errors (validation, auth, feature gate): return specific messages.
For unknown errors: generic 500 with logged details.

### 3. Create cleanup service (`src/api/services/cleanup-service.js`)
```js
const RETENTION = { free: 7, pro: 30, business: 90 };

export async function cleanupRunHistory(db) {
  const users = await db.prepare(
    'SELECT DISTINCT user_id FROM run_history'
  ).all();

  for (const { user_id } of users.results) {
    const plan = await getUserPlan(db, user_id);
    const days = RETENTION[plan] || 7;
    const cutoff = Math.floor(Date.now() / 1000) - (days * 86400);
    await db.prepare(
      'DELETE FROM run_history WHERE user_id = ? AND ran_at < ?'
    ).bind(user_id, cutoff).run();
  }
}
```

### 4. Add cleanup cron trigger
In `wrangler.toml`:
```toml
[triggers]
crons = ["*/30 * * * *", "0 * * * *", "0 3 * * *"]  # stream runs, token refresh, cleanup
```

In `src/adapters/cloudflare.js`:
```js
if (cron === '0 3 * * *') {
  ctx.waitUntil(cleanupRunHistory(env.DB));
  return;
}
```

### 5. Create error log page (`src/dashboard/public/pages/error-log.js`)
- Query: `GET /api/runs?status=failed`
- Table: timestamp, stream name, error message, retry count
- Expandable rows for full error detail
- Link to stream config for debugging
- "Retry now" button → POST /api/streams/:id/run

### 6. E2E manual test checklist
Execute full flow on staging:

```
[ ] 1. Visit landing page — loads, CTAs work
[ ] 2. Click "Get Started Free" → signup page
[ ] 3. Create account (email+password)
[ ] 4. Redirected to onboarding wizard
[ ] 5. Select 2 sources (RSS + HackerNews)
[ ] 6. Select Groq AI (free tier)
[ ] 7. Configure Telegram output (real bot)
[ ] 8. Set daily schedule
[ ] 9. Click Preview → AI content appears
[ ] 10. Click Activate → stream created, visible in dashboard
[ ] 11. Manually trigger stream → run appears in history
[ ] 12. Check Telegram → message received
[ ] 13. Try creating 2nd stream → 403 (free tier limit)
[ ] 14. Upgrade to Pro via checkout (Polar sandbox)
[ ] 15. Verify webhook → plan updated
[ ] 16. Create 2nd stream → succeeds
[ ] 17. Check billing page → shows Pro plan
[ ] 18. Manage billing → Polar portal opens
[ ] 19. Cancel subscription in portal
[ ] 20. Verify cancellation webhook → status updated
[ ] 21. Try accessing Pro features → still works until period end
[ ] 22. Logout → login → session persists (cookie)
[ ] 23. Google OAuth login → works
```

### 7. Production deployment
```bash
# 1. Set all secrets
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put POLAR_ACCESS_TOKEN
wrangler secret put POLAR_WEBHOOK_SECRET
wrangler secret put TRIGGER_SECRET
wrangler secret put TOKEN_ENCRYPTION_KEY

# 2. Apply D1 migrations to production
wrangler d1 migrations apply newsengine-db --remote

# 3. Create CF Queue
wrangler queues create newsengine-stream-jobs
wrangler queues create newsengine-stream-jobs-dlq

# 4. Deploy Worker
wrangler deploy

# 5. Deploy Pages (landing)
npx wrangler pages deploy landing/ --project-name=newsengine

# 6. Configure custom domain
# Worker: api.newsengine.app
# Pages: newsengine.app

# 7. WAF bypass rule for webhook path
# (manual in CF dashboard)

# 8. Configure Polar webhook URL (production)

# 9. Smoke test production endpoints
```

### 8. Post-launch monitoring
- `wrangler tail` for real-time error logs
- Check DLQ daily for failed queue messages
- Monitor D1 storage usage via CF dashboard
- Set up uptime monitoring (external ping to /health)

## Todo List
- [ ] Create `src/api/middleware/rate-limit.js`
- [ ] Apply rate limits to all route groups
- [ ] Sanitize all error responses (no stack traces)
- [ ] Create `src/api/services/cleanup-service.js`
- [ ] Add cleanup cron to wrangler.toml + cloudflare.js
- [ ] Create error log UI page
- [ ] Add "Retry now" button for failed runs
- [ ] Run full E2E manual test on staging
- [ ] Fix all issues found in E2E test
- [ ] Set production secrets via wrangler
- [ ] Apply migrations to production D1
- [ ] Create production queues
- [ ] Deploy Worker + Pages to production
- [ ] Configure custom domains
- [ ] Create WAF bypass rule
- [ ] Configure Polar production webhook
- [ ] Smoke test production
- [ ] Set up uptime monitoring

## Success Criteria
- Rate limiting returns 429 when exceeded
- Error responses never contain stack traces or internal paths
- Cleanup job deletes old run_history based on tier retention
- Full E2E flow works: signup → stream → output → billing
- Production deployment succeeds with zero downtime
- Health endpoint returns 200 on production
- Polar webhook works in production (test ping)
- All 23 items in E2E checklist pass

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Rate limit KV race condition | Low | Low | Over-count is acceptable; under-count rare with TTL |
| Cleanup job exceeds CPU limit for many users | Low | Medium | Batch by 100 users, use queue if >500 |
| Production migration breaks existing data | Low | High | D1 auto-backup before migration; test on staging first |
| DNS propagation delay on custom domain | Medium | Low | Deploy early, test with worker.dev URL first |

## Security Considerations
- Rate limiting prevents brute-force on auth endpoints
- Production secrets never committed to git
- WAF bypass scoped to exact webhook path only
- Error sanitization prevents information leakage
- Uptime monitor uses /health (no auth required, returns no sensitive data)

## Next Steps (Post-MVP)
- V1.1: X/Facebook/Threads OAuth per-tenant flow
- V1.1: Public API + API key authentication
- V1.1: Stream templates library
- V1.2: Usage metering + overage billing
- V1.2: Team collaboration (org-level streams)
- V1.3: Custom AI model support (BYOK)
