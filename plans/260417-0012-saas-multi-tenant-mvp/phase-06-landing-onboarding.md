---
phase: 06
title: "Landing Page + Onboarding Wizard"
status: complete
priority: P2
effort: 3d
---

# Phase 06: Landing Page + Onboarding Wizard

## Context Links
- Parent: [plan.md](./plan.md)
- Brainstorm: [SaaS Scaling Strategy](../reports/brainstorm-260417-0012-saas-scaling-strategy.md)
- Depends on: Phase 03 (Stream CRUD), Phase 05 (Billing)
- Blocks: Phase 07

## Overview
Public landing page on CF Pages and a guided onboarding wizard for new signups. The wizard walks users through creating their first stream step-by-step instead of exposing the raw stream builder form.

## Key Insights
- Landing page is static HTML/CSS — no framework needed, fast load, CF Pages free tier
- Onboarding wizard reuses stream builder components from Phase 03 but in guided steps
- First-time experience is critical for conversion — wizard reduces cognitive load
- Positioning: "AI news curator that posts TO your channels on autopilot"
- Free tier gives users immediate value (1 Telegram stream with Groq AI)

## Requirements

### Functional
- Landing page: hero, feature grid, pricing table, CTA buttons, footer
- Landing page CTAs → signup page (Phase 02)
- Onboarding wizard triggered on first login (no streams yet)
- Wizard steps: choose sources → choose AI → connect output → set schedule → preview & activate
- Each step validates before advancing
- Wizard creates a stream via POST /api/streams on completion
- Skip wizard option for experienced users

### Non-Functional
- Landing page: <100KB total, <2s LCP, no JS required for content
- Onboarding wizard: works on mobile (responsive)
- Wizard completion rate target: >60% (track via simple analytics)

## Architecture

```
CF Pages (static)
  ├── / (landing page)
  ├── /pricing (anchor or separate page)
  └── /app/* → CF Worker (Hono API + SPA)

Onboarding Wizard (Preact, inside SPA)
  Step 1: Source picker
    → Checkbox grid: RSS (custom URL), HackerNews, Reddit, Dev.to, GitHub Trending
    → Free tier: max 2 sources highlighted
  Step 2: AI config
    → Provider dropdown (Groq free, others locked by tier)
    → Language selector, style selector
  Step 3: Output config
    → Telegram: bot token + chat ID input (with inline help)
    → Discord: webhook URL (locked on free)
    → Others locked on free
  Step 4: Schedule
    → Preset buttons: "Daily 7am", "Twice daily", "Custom"
    → Custom cron input (hidden by default)
  Step 5: Review & Activate
    → Summary card showing all config
    → "Preview" button → dry-run via /api/streams/preview-config
    → "Activate" button → POST /api/streams → redirect to dashboard
```

## Related Code Files

### Create
- `landing/index.html` — static landing page
- `landing/styles.css` — landing page styles
- `landing/_routes.json` — CF Pages routing (proxy /app/* to Worker)
- `src/dashboard/public/pages/onboarding.js` — wizard container component
- `src/dashboard/public/components/source-picker.js` — reusable source selection UI
- `src/dashboard/public/components/output-config.js` — reusable output config UI
- `src/dashboard/public/components/schedule-picker.js` — schedule selection UI
- `src/dashboard/public/components/wizard-step.js` — step wrapper with nav

### Modify
- `src/dashboard/public/app.js` — redirect to onboarding if no streams on first login
- `src/api/routes/streams.js` — add `POST /api/streams/preview-config` (preview without saving)
- `src/dashboard/public/pages/stream-builder.js` — extract shared components

## Implementation Steps

### 1. Create landing page (`landing/index.html`)
Static HTML with embedded CSS. Sections:
- **Hero**: headline + subheadline + "Get Started Free" CTA
- **How it works**: 3-step visual (Sources → AI → Channels)
- **Features**: grid of key features with icons
- **Pricing**: 3-column table matching tier spec
- **Social proof**: placeholder for testimonials (empty at launch)
- **Footer**: links, legal

### 2. Create CF Pages routing (`landing/_routes.json`)
```json
{
  "version": 1,
  "include": ["/*"],
  "exclude": ["/app/*", "/api/*"]
}
```
Pages serves static content; `/app/*` and `/api/*` proxied to Worker via custom domain or service binding.

### 3. Create wizard step component (`src/dashboard/public/components/wizard-step.js`)
- Props: title, description, stepNumber, totalSteps, onNext, onBack, canAdvance
- Renders: step indicator, content slot, back/next buttons
- Next button disabled until `canAdvance` is true

### 4. Create source picker component (`src/dashboard/public/components/source-picker.js`)
- Grid of source cards: RSS, HackerNews, Reddit, Dev.to, GitHub Trending
- Each card: icon, name, brief description, checkbox
- RSS card: expandable with URL input field
- Free tier indicator on cards exceeding limit
- Returns: `sources[]` config array

### 5. Create output config component (`src/dashboard/public/components/output-config.js`)
- Output type selector (tabs or cards)
- Per-type config form:
  - Telegram: bot token input, chat ID input, "How to get these?" help link
  - Discord: webhook URL input, "How to create webhook?" help link
  - Slack: webhook URL input
  - Webhook: URL input, optional headers
  - Email: recipient address (uses built-in email output)
- Free tier: only Telegram tab enabled, others show "Upgrade to Pro"
- Returns: `outputs[]` config array

### 6. Create schedule picker component (`src/dashboard/public/components/schedule-picker.js`)
- Preset buttons: "Daily at 7 AM", "Twice daily (7 AM, 7 PM)", "Every 6 hours"
- Custom toggle: reveals cron input with syntax help
- Free tier: "Daily" only, custom locked
- Timezone note (UTC with local time preview)
- Returns: cron string

### 7. Create onboarding wizard (`src/dashboard/public/pages/onboarding.js`)
- 5 steps using wizard-step wrapper
- State: `{ sources: [], ai: {}, outputs: [], schedule: '', name: '' }`
- Step 5: "Preview" calls `POST /api/streams/preview-config` with assembled config
- Step 5: "Activate" calls `POST /api/streams` → redirects to dashboard with success toast
- "Skip setup" link → goes to dashboard (empty streams page)

### 8. Add preview-config endpoint
In `src/api/routes/streams.js`:
```js
// Preview without saving — accepts raw config, runs engine, returns output
app.post('/preview-config', requireAuth(), async (c) => {
  const { config } = await c.req.json();
  // Validate config
  // Build engine from config
  // Run generate() (not run() — no output send)
  // Return preview content
});
```

### 9. Update app.js routing
```js
// After auth check, if user has 0 streams → redirect to /onboarding
const streams = await fetch('/api/streams').then(r => r.json());
if (streams.length === 0 && !localStorage.getItem('skip_onboarding')) {
  navigate('/onboarding');
}
```

### 10. Deploy landing page to CF Pages
```bash
# From landing/ directory
npx wrangler pages deploy landing/ --project-name=newsengine
```

## Todo List
- [ ] Create `landing/index.html` with hero, features, pricing, CTA
- [ ] Create `landing/styles.css`
- [ ] Create `landing/_routes.json` for CF Pages routing
- [ ] Create wizard-step component
- [ ] Create source-picker component
- [ ] Create output-config component
- [ ] Create schedule-picker component
- [ ] Create onboarding wizard page
- [ ] Add preview-config endpoint to streams routes
- [ ] Update app.js to redirect new users to onboarding
- [ ] Extract shared components from stream-builder (Phase 03 refactor)
- [ ] Test: complete wizard end-to-end → stream created and active
- [ ] Test: skip wizard → empty dashboard
- [ ] Test: free tier limits shown correctly in wizard
- [ ] Deploy landing page to CF Pages

## Success Criteria
- Landing page loads in <2s, renders correctly on mobile
- Pricing table matches spec (Free/Pro/Business)
- CTA buttons lead to signup
- New user redirected to onboarding wizard on first login
- Wizard completes successfully → stream appears in dashboard
- Preview shows formatted AI output before activation
- Free tier limits visually indicated at each step
- Skip option works without errors

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| CF Pages routing conflicts with Worker | Medium | Medium | Test _routes.json thoroughly; use custom domain split if needed |
| Wizard UX too complex for mobile | Medium | Medium | Keep steps simple, one concern per step |
| Preview-config expensive (AI call on preview) | Low | Low | Cache preview result, rate limit to 3/hour |
| Landing page SEO weak without SSR | Low | Low | Static HTML is fine for MVP; SSR later if needed |

## Security Considerations
- Landing page is fully public — no auth needed
- Preview-config endpoint requires auth (prevents abuse)
- Bot token / webhook URL inputs: warn users not to share these publicly
- No analytics tracking scripts at launch (privacy-first)

## Next Steps
- Phase 07 polishes UX, adds error handling, and prepares for launch
