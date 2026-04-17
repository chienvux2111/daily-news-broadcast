---
phase: 05
title: "Billing Integration — Polar.sh"
status: complete
priority: P1
effort: 3d
---

# Phase 05: Billing Integration — Polar.sh

## Context Links
- Parent: [plan.md](./plan.md)
- Research: [Auth & Billing — Polar](./research/researcher-01-auth-billing.md#topic-2)
- Depends on: Phase 02 (Auth + Polar plugin scaffolding)
- Blocks: Phase 06

## Overview
Create Polar.sh products for Free/Pro/Business tiers. Implement checkout flow, webhook handlers for subscription lifecycle, customer portal access, and upgrade/downgrade UI. Feature gating (Phase 03) already reads subscription status — this phase writes it.

## Key Insights
- Better Auth Polar plugin already routes webhooks to `/api/auth/polar/webhooks` (from Phase 02)
- Plugin provides `onCustomerStateChanged` and `onOrderPaid` hooks — we implement the DB sync logic
- Checkout: create server-side via SDK → redirect user to Polar checkout URL
- Customer portal: `polar.customerSessions.create()` → redirect URL for self-service management
- Polar is MoR (Merchant of Record) — handles tax, VAT, refunds
- SDK is fetch-native, works on CF Workers without polyfills

## Requirements

### Functional
- 3 products created in Polar dashboard (Free/Pro/Business with correct pricing)
- Checkout endpoint: user clicks upgrade → redirected to Polar checkout
- Webhook handlers: subscription created/active/canceled/revoked → update D1
- Customer portal: user clicks "Manage billing" → redirected to Polar self-service portal
- Upgrade/downgrade reflected in feature gate within seconds of webhook
- Billing page in dashboard: current plan, usage stats, upgrade/manage buttons

### Non-Functional
- Webhook processing < 5s (D1 write + response)
- Checkout redirect < 2s
- No double-charge on rapid upgrade/downgrade (Polar handles proration)

## Architecture

### Checkout Flow
```
Dashboard "Upgrade to Pro" button
  → GET /api/billing/checkout?plan=pro
  → Server: polar.checkouts.create({
       productId: PRO_PRODUCT_ID,
       customerEmail: user.email,
       metadata: { userId: user.id },
       successUrl: APP_URL + '/dashboard?upgraded=true'
     })
  → 302 Redirect to checkout.url (Polar hosted page)
  → User pays on Polar
  → Polar sends webhook to /api/auth/polar/webhooks
  → onCustomerStateChanged:
       UPDATE polar_subscription SET status='active', productId=PRO_PRODUCT_ID
  → Feature gate reads new status on next API call
```

### Webhook Event Handling
```
onCustomerStateChanged({ event })
  ├─ event.data.status === 'active'
  │   → UPSERT polar_subscription: status='active', productId, currentPeriodEnd
  │   → UPDATE users SET plan = derivePlanFromProduct(productId)
  │
  ├─ event.data.status === 'canceled'
  │   → UPDATE polar_subscription: status='canceled', canceledAt
  │   → (keep access until currentPeriodEnd)
  │
  └─ event.data.status === 'revoked'
      → UPDATE polar_subscription: status='revoked'
      → UPDATE users SET plan = 'free'

onOrderPaid({ event })
  → Log for analytics, no action needed (subscription events handle access)
```

## Related Code Files

### Create
- `src/api/routes/billing.js` — checkout, portal, plan info endpoints
- `src/api/services/billing-service.js` — subscription DB operations + plan derivation
- `src/api/constants/products.js` — Polar product ID mapping
- `src/dashboard/public/pages/billing.js` — billing/plan management page

### Modify
- `src/api/auth.js` — fill in Polar webhook handlers (onCustomerStateChanged, onOrderPaid)
- `src/api/app.js` — mount billing routes
- `src/dashboard/public/app.js` — add billing page to router

### Keep
- All `src/core/*`, `src/sources/*`, `src/ai/*`, `src/outputs/*`

## Implementation Steps

### 1. Create Polar products (manual — Polar dashboard)
Create 3 products in Polar.sh dashboard:
- **Free**: $0/mo (no checkout needed, default on signup)
- **Pro**: $15/mo recurring
- **Business**: $39/mo recurring

Record product IDs for use in code.

### 2. Create product constants (`src/api/constants/products.js`)
```js
export const PRODUCTS = {
  pro:      { id: 'prod_xxx', price: 1500, name: 'Pro' },
  business: { id: 'prod_yyy', price: 3900, name: 'Business' },
};

export function planFromProductId(productId) {
  if (productId === PRODUCTS.pro.id) return 'pro';
  if (productId === PRODUCTS.business.id) return 'business';
  return 'free';
}
```

### 3. Create billing service (`src/api/services/billing-service.js`)
- `getSubscription(db, userId)` — current active subscription
- `upsertSubscription(db, { userId, polarCustomerId, productId, status, currentPeriodEnd })`
- `cancelSubscription(db, userId, canceledAt)`
- `revokeSubscription(db, userId)` — set status=revoked, update user plan to free
- `getUserPlan(db, userId)` — returns plan string from users table (used by feature gate)
- `getUsageStats(db, userId)` — stream count, run count this month

### 4. Implement webhook handlers in `src/api/auth.js`
Fill in the placeholder handlers from Phase 02:
```js
webhooks: {
  secret: env.POLAR_WEBHOOK_SECRET,
  onCustomerStateChanged: async ({ event }) => {
    const { customerId, status } = event.data;
    // Look up userId from polar_customer table
    // Update subscription status + user plan
  },
  onOrderPaid: async ({ event }) => {
    // Log for analytics
    console.log(`[Billing] Order paid: ${event.data.id}`);
  },
}
```

**Critical**: webhook handlers run inside Better Auth context — they have access to the DB but need to use raw D1 queries (not the auth ORM).

### 5. Create billing routes (`src/api/routes/billing.js`)
```
GET  /api/billing/plan          → current plan + usage stats
GET  /api/billing/checkout      → create Polar checkout → redirect
GET  /api/billing/portal        → create Polar customer portal session → redirect
```

Checkout route:
```js
app.get('/checkout', requireAuth(), async (c) => {
  const user = c.get('user');
  const plan = c.req.query('plan'); // 'pro' or 'business'
  const product = PRODUCTS[plan];
  if (!product) return c.json({ error: 'Invalid plan' }, 400);

  const polar = new Polar({ accessToken: c.env.POLAR_ACCESS_TOKEN });
  const checkout = await polar.checkouts.create({
    productId: product.id,
    customerEmail: user.email,
    metadata: { userId: user.id },
    successUrl: `${c.env.APP_URL}/dashboard?upgraded=true`,
  });
  return c.redirect(checkout.url);
});
```

Portal route:
```js
app.get('/portal', requireAuth(), async (c) => {
  const user = c.get('user');
  const customer = await getCustomerByUserId(c.env.DB, user.id);
  if (!customer) return c.json({ error: 'No billing account' }, 404);

  const polar = new Polar({ accessToken: c.env.POLAR_ACCESS_TOKEN });
  const session = await polar.customerSessions.create({
    customerId: customer.polarCustomerId,
  });
  return c.redirect(session.url);
});
```

### 6. Create billing UI page (`src/dashboard/public/pages/billing.js`)
- Current plan card (Free/Pro/Business) with feature comparison
- Usage stats: X/Y streams used, runs this month
- "Upgrade to Pro" / "Upgrade to Business" buttons → `/api/billing/checkout?plan=X`
- "Manage Billing" button → `/api/billing/portal` (for paid users)
- "Downgrade" info text: "Manage your subscription in the billing portal"
- Success banner when redirected back with `?upgraded=true`

### 7. Add WAF bypass for webhook path
In Cloudflare dashboard: Security → WAF → Create rule:
- Expression: `(http.request.uri.path eq "/api/auth/polar/webhooks")`
- Action: Skip (bypass Bot Fight Mode, managed rules)

### 8. Configure webhook in Polar dashboard
- URL: `https://api.newsengine.app/api/auth/polar/webhooks`
- Events: subscription.created, subscription.active, subscription.canceled, subscription.revoked, order.paid
- Send test event to verify

### 9. Test
```bash
# Test checkout flow
# 1. Login as user
# 2. Navigate to /api/billing/checkout?plan=pro
# 3. Complete Polar checkout (sandbox mode)
# 4. Verify webhook received → subscription saved → plan updated
# 5. Verify feature gate now allows Pro features
# 6. Test portal link
```

## Todo List
- [ ] Create Free/Pro/Business products in Polar dashboard
- [ ] Create `src/api/constants/products.js`
- [ ] Create `src/api/services/billing-service.js`
- [ ] Implement webhook handlers in `src/api/auth.js`
- [ ] Create `src/api/routes/billing.js` (checkout + portal + plan)
- [ ] Mount billing routes in `src/api/app.js`
- [ ] Create billing UI page
- [ ] Add WAF bypass rule for webhook path in CF dashboard
- [ ] Configure webhook URL in Polar dashboard
- [ ] Test: checkout flow end-to-end (sandbox)
- [ ] Test: webhook updates subscription + user plan
- [ ] Test: cancellation keeps access until period end
- [ ] Test: revocation immediately downgrades to free
- [ ] Test: feature gate reflects new plan within seconds

## Success Criteria
- User can upgrade from Free → Pro via checkout flow
- Polar webhook updates subscription status in D1 within seconds
- Feature gate immediately reflects new plan (new streams, outputs, AI providers unlocked)
- Customer portal link works for paid users
- Cancellation: user retains access until `currentPeriodEnd`
- Revocation: user immediately downgraded to free, excess streams deactivated? No — just gated on next create
- Billing page shows accurate plan and usage stats

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Polar webhook delivery failures | Medium | High | DLQ on Polar side + manual retry button in Polar dashboard |
| Bot Fight Mode blocks webhooks | High | High | WAF bypass rule BEFORE going live (step 7) |
| Webhook handler DB error leaves inconsistent state | Medium | Medium | Idempotent handlers: UPSERT, not INSERT |
| User clicks checkout twice → double subscription | Low | Medium | Polar deduplicates by customer email |

## Security Considerations
- Polar webhook signature validated by Better Auth plugin (no manual validation)
- Checkout metadata.userId must match authenticated user (prevents spoofing)
- Customer portal session created server-side — user can't access others' portals
- Product IDs hardcoded, not user-supplied — prevents price manipulation
- No billing secrets in client-side code
- WAF bypass scoped to exact webhook path, not wildcard

## Next Steps
- Phase 06 references billing tier in onboarding wizard (show locked features)
- Phase 07 adds subscription expiry cleanup job
