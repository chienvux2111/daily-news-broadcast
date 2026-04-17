---
phase: 03
title: "Multi-Tenant Stream Management"
status: complete
priority: P1
effort: 4d
---

# Phase 03: Multi-Tenant Stream Management

## Context Links
- Parent: [plan.md](./plan.md)
- Research: [Infra Architecture](./research/researcher-02-infra-architecture.md)
- Depends on: Phase 01 (D1), Phase 02 (Auth)
- Blocks: Phase 04, 06

## Overview
Tenant-aware CRUD API for streams. Each stream is a JSON config blob (sources, AI provider, outputs, schedule) stored in D1. Feature gating middleware enforces tier limits. Stream builder UI in Preact SPA lets users configure sources, AI, outputs, and schedule visually.

## Key Insights
- `streams.config` is a JSON TEXT column — avoids over-normalizing at MVP
- Every DB query MUST include `WHERE user_id = ?` — enforced by db wrapper from Phase 01
- Feature limits (max streams, sources/stream, allowed channels) derived from subscription tier
- Stream config must be validated server-side before save — invalid configs would fail silently at runtime
- Existing `buildEngine()` from `src/channels/runner.js` takes a channel config and builds a NewsEngine — tenant stream config maps to the same shape

## Requirements

### Functional
- CRUD endpoints: create, read, update, delete streams
- List streams for authenticated user (paginated)
- Toggle stream active/inactive
- Validate stream config on create/update (valid sources, AI provider, output type)
- Feature gating: reject requests that exceed tier limits
- Stream builder UI: source picker, AI config, output config, schedule selector
- Preview: dry-run a stream config without saving run history

### Non-Functional
- Stream list query < 30ms for users with <50 streams
- Config validation < 5ms (no external calls)
- Feature gate check < 10ms (single D1 query for subscription status)

## Architecture

### Data Flow: Create Stream
```
SPA form submit
  → POST /api/streams { name, config: { sources, ai, outputs, schedule } }
  → Auth middleware → user_id from session
  → Feature gate: count user streams vs tier limit
  → Validate config schema
  → INSERT INTO streams (id, user_id, name, config, active)
  → 201 { stream }
```

### Stream Config JSON Schema
```json
{
  "sources": [
    { "type": "rss", "url": "https://...", "limit": 3 },
    { "type": "hackernews", "minPoints": 100, "limit": 5 },
    { "type": "reddit", "subreddit": "programming", "limit": 3 }
  ],
  "ai": {
    "provider": "groq",
    "model": "llama-3.3-70b-versatile",
    "language": "en",
    "style": "digest"
  },
  "outputs": [
    { "type": "telegram", "botToken": "***", "chatId": "-100..." },
    { "type": "discord", "webhookUrl": "https://discord.com/api/webhooks/..." }
  ],
  "schedule": "0 7 * * *",
  "maxArticles": 15,
  "concurrency": 5
}
```

### Feature Limits by Tier
```js
const TIER_LIMITS = {
  free:     { maxStreams: 1,  maxSourcesPerStream: 2,  allowedOutputs: ['telegram'], allowedAI: ['groq'] },
  pro:      { maxStreams: 5,  maxSourcesPerStream: 10, allowedOutputs: ['telegram','discord','slack','webhook','email'], allowedAI: ['groq','openai','claude'] },
  business: { maxStreams: -1, maxSourcesPerStream: -1, allowedOutputs: '*', allowedAI: '*' },
};
```

## Related Code Files

### Create
- `src/api/routes/streams.js` — Hono route group for /api/streams CRUD
- `src/api/middleware/feature-gate.js` — tier limit enforcement middleware
- `src/api/validators/stream-config.js` — config schema validation
- `src/api/services/stream-service.js` — DB operations for streams (thin layer over D1)
- `src/api/constants/tier-limits.js` — tier limit definitions
- `src/dashboard/public/pages/streams.js` — stream list page
- `src/dashboard/public/pages/stream-builder.js` — stream create/edit form

### Modify
- `src/api/app.js` — mount stream routes
- `src/dashboard/public/app.js` — add stream pages to router

### Keep
- All `src/core/*`, `src/sources/*`, `src/ai/*`, `src/outputs/*`

## Implementation Steps

### 1. Create tier limits constant (`src/api/constants/tier-limits.js`)
- Export `TIER_LIMITS` object keyed by plan name
- Export `getLimitsForUser(subscription)` helper — returns limits for active plan, defaults to `free`

### 2. Create feature gate middleware (`src/api/middleware/feature-gate.js`)
```js
export function featureGate(check) {
  return async (c, next) => {
    const user = c.get('user');
    const sub = await getActiveSubscription(c.env.DB, user.id);
    const limits = getLimitsForUser(sub);
    const result = await check(c, limits);
    if (result.blocked) return c.json({ error: result.reason }, 403);
    c.set('limits', limits);
    c.set('subscription', sub);
    await next();
  };
}
```

### 3. Create stream config validator (`src/api/validators/stream-config.js`)
- Validate: sources array non-empty, each source has valid `type`
- Validate: ai object has valid `provider`
- Validate: outputs array non-empty, each output has valid `type` + required fields
- Validate: schedule is valid cron expression (regex check, not full parser)
- Returns `{ valid: boolean, errors: string[] }`

### 4. Create stream service (`src/api/services/stream-service.js`)
- `listStreams(db, userId, { limit, offset })` — paginated
- `getStream(db, userId, streamId)` — single stream, user-scoped
- `createStream(db, userId, { name, config })` — generates UUID, inserts
- `updateStream(db, userId, streamId, { name, config, active })` — partial update
- `deleteStream(db, userId, streamId)` — hard delete
- `countStreams(db, userId)` — for feature gate check
- All queries include `WHERE user_id = ?`

### 5. Create stream routes (`src/api/routes/streams.js`)
```
GET    /api/streams            → list (paginated)
POST   /api/streams            → create (validate + gate: max streams, sources count, output types, AI provider)
GET    /api/streams/:id        → get single
PUT    /api/streams/:id        → update (validate + gate)
DELETE /api/streams/:id        → delete
POST   /api/streams/:id/toggle → toggle active/inactive
POST   /api/streams/:id/preview → dry-run: build engine from config, run, return result (no history saved)
```

### 6. Mount in app.js
```js
import { streamRoutes } from './routes/streams.js';
app.route('/api/streams', streamRoutes);
```

### 7. Build stream list page (`src/dashboard/public/pages/streams.js`)
- Fetch `GET /api/streams` on mount
- Card per stream: name, source count, output icons, schedule, active toggle, edit/delete buttons
- "New Stream" button → navigate to builder
- Empty state with call-to-action

### 8. Build stream builder page (`src/dashboard/public/pages/stream-builder.js`)
- Multi-step form OR single-page form with sections:
  - **Sources**: add/remove source configs. Dropdown for type, then type-specific fields (URL for RSS, subreddit for Reddit, etc.)
  - **AI**: provider dropdown (filtered by tier), model dropdown, language, style
  - **Outputs**: add/remove output configs. Type dropdown, then type-specific fields (bot token for Telegram, webhook URL for Discord, etc.)
  - **Schedule**: cron preset buttons (daily 7am, 2x/day, custom) + custom cron input
  - **Name**: stream name input
- Submit → POST /api/streams → redirect to stream list
- Edit mode: populate form from existing stream config

### 9. Sensitive field handling
- Output configs contain secrets (bot tokens, webhook URLs)
- Store encrypted in D1? YAGNI for MVP — store as-is in JSON blob
- API responses MUST mask sensitive fields (show last 4 chars only)
- Never return full secrets in GET responses

### 10. Test
```bash
# Create stream
curl -b cookie.txt -X POST /api/streams -d '{"name":"test","config":{...}}'
# List streams
curl -b cookie.txt /api/streams
# Feature gate: create 2nd stream on free tier → 403
```

## Todo List
- [ ] Create `src/api/constants/tier-limits.js`
- [ ] Create `src/api/middleware/feature-gate.js`
- [ ] Create `src/api/validators/stream-config.js`
- [ ] Create `src/api/services/stream-service.js`
- [ ] Create `src/api/routes/streams.js` (CRUD + toggle + preview)
- [ ] Mount stream routes in `src/api/app.js`
- [ ] Create stream list page component
- [ ] Create stream builder page component
- [ ] Add sensitive field masking to GET responses
- [ ] Test: CRUD operations with auth
- [ ] Test: feature gate blocks over-limit requests
- [ ] Test: config validation rejects invalid schemas
- [ ] Test: preview endpoint returns formatted output

## Success Criteria
- Authenticated user can create, read, update, delete streams
- Free-tier user blocked from creating 2nd stream (403 + clear message)
- Free-tier user blocked from selecting non-Telegram outputs
- Invalid stream config returns 400 with specific error messages
- Stream list UI renders correctly with 0, 1, and 5 streams
- Stream builder UI submits valid config and creates stream
- Preview endpoint returns AI-formatted content without saving to run_history
- Secrets masked in all GET responses

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Stream config schema drift from engine expectations | Medium | High | Validation layer checks against known source/AI/output types |
| Secrets in D1 JSON blob unencrypted | Medium | Medium | Acceptable for MVP; encrypt sensitive fields in V1.1 |
| Feature gate race condition (2 concurrent creates) | Low | Low | D1 serializes writes; count check is eventually consistent but acceptable |
| Stream builder UI complexity | Medium | Medium | Start with single-page form, not wizard |

## Security Considerations
- All queries user-scoped — no cross-tenant data access
- Secrets masked in API responses (last 4 chars visible)
- Feature gate runs BEFORE config validation (fail fast, no resource waste)
- Stream config size limit: 10KB max (prevents abuse via oversized JSON)
- Rate limit stream creation: 10/hour per user (Phase 07)

## Next Steps
- Phase 04 reads stream configs from D1 to execute via Queue consumer
- Phase 06 onboarding wizard is a guided version of the stream builder
