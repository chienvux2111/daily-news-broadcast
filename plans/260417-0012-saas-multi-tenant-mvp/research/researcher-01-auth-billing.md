# Auth & Billing Research: Better Auth + Polar on CF Workers
Date: 2026-04-17 | Researcher: researcher

---

## Topic 1: Better Auth + Cloudflare D1

### D1 Adapter Setup

Better Auth v1.x has **native D1 support** — pass the binding directly, no third-party adapter needed:

```js
import { betterAuth } from "better-auth";

export default {
  fetch(req, env) {
    const auth = betterAuth({
      database: { db: env.DB, type: "sqlite" }, // D1 binding direct
      // ...
    });
    return auth.handler(req);
  }
}
```

Alternative: use Drizzle adapter with D1 dialect (more control, required for custom columns):

```js
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/d1";

const db = drizzle(env.DB);
betterAuth({ database: drizzleAdapter(db, { provider: "sqlite" }) });
```

Schema generated via: `npx better-auth generate` → creates `auth.schema.ts` → migrate with `wrangler d1 migrations apply`.

D1 **does not support interactive transactions** — Better Auth uses D1's `batch()` API for atomicity. This is handled internally; no workaround needed.

### Tables Created

| Table | Key Columns |
|---|---|
| `user` | id, name, email, emailVerified, image, createdAt, updatedAt |
| `session` | id, userId, token, expiresAt, ipAddress, userAgent |
| `account` | id, userId, accountId, providerId, accessToken, refreshToken, idToken, expiresAt |
| `verification` | id, identifier, value, expiresAt |

Polar plugin adds `polar_customer` and `polar_subscription` tables (see Topic 2).

### Session Strategy

- Default: **cookie-based sessions** stored in D1. Token in `session` table, cookie on client.
- CF Workers compatible — `Request`/`Response` APIs match.
- Optional: use **Cloudflare KV** as secondary session cache (min 60s TTL). Useful if session lookup latency on D1 is a concern.
- JWT sessions available via plugin but cookie-session is the default and simpler for SaaS.

### Email+Password + Google OAuth

```js
betterAuth({
  database: { db: env.DB, type: "sqlite" },
  emailAndPassword: { enabled: true },
  socialProviders: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    }
  }
});
```

No extra packages. Google OAuth callback handled at `/api/auth/callback/google` automatically.

### CF Workers Gotchas

1. **No `process.env`** — all secrets via `env` bindings; pass them into `betterAuth()` at request time (inside `fetch()` handler), not at module init.
2. **D1 batch() only** — no transactions; Better Auth handles this internally.
3. **`better-auth-cloudflare` npm package** (`zpg6/better-auth-cloudflare`) exists for CLI scaffolding + resource provisioning, optional but useful for greenfield.
4. **Wrangler D1 migrations**: run `wrangler d1 migrations apply DB --remote` after schema generation.
5. **Bot Fight Mode**: if using Polar webhooks, disable CF Bot Fight Mode or create a WAF bypass rule for `/api/auth/polar/webhooks`.

Sources: [DEV Community](https://dev.to/atman33/setup-better-auth-with-react-router-cloudflare-d1-2ad4) | [Hono example](https://hono.dev/examples/better-auth-on-cloudflare) | [better-auth-cloudflare](https://github.com/zpg6/better-auth-cloudflare) | [AnswerOverflow](https://www.answeroverflow.com/m/1315488348118454282)

---

## Topic 2: Better Auth Polar Plugin

### How It Works

Plugin package: `@polar-sh/better-auth`

```js
import { polar } from "@polar-sh/better-auth";
import { Polar } from "@polar-sh/sdk";

const polarClient = new Polar({ accessToken: env.POLAR_ACCESS_TOKEN });

betterAuth({
  plugins: [
    polar({
      client: polarClient,
      createCustomerOnSignUp: true,  // auto-create Polar customer on user register
      enableCustomerPortal: true,
      checkout: { enabled: true, products: [...] },
      webhooks: {
        secret: env.POLAR_WEBHOOK_SECRET,
        onCustomerStateChanged: async ({ event, db }) => { /* sync sub status */ },
        onOrderPaid: async ({ event }) => { /* grant access */ },
      }
    })
  ]
});
```

### Auto-Sync Behavior

- `createCustomerOnSignUp: true` → Polar Customer created automatically, `externalId` = user DB id.
- **Webhook-driven sync**: Polar sends events to `/api/auth/polar/webhooks`; the plugin receives and routes them to your handlers. You write the DB sync logic in `onCustomerStateChanged` / `onOrderPaid`.
- Plugin does NOT auto-write subscription status to your DB — you do that in webhook handlers. It provides the routing and validation layer.

### Tables/Fields Added

The plugin expects (and may create via migration) two tables:

| Table | Key Columns |
|---|---|
| `polar_customer` | id, userId, polarCustomerId, createdAt |
| `polar_subscription` | id, polarCustomerId, productId, status, currentPeriodEnd, canceledAt |

Exact schema depends on version — run `npx better-auth generate` after adding plugin to get actual migration SQL.

### Checking Subscription in Middleware

**Server-side** (in CF Worker route handler):

```js
import { auth } from "./auth"; // your betterAuth instance

async function requirePro(req, env) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  // Query your polar_subscription table
  const sub = await env.DB.prepare(
    "SELECT status FROM polar_subscription WHERE userId = ? AND status = 'active'"
  ).bind(session.user.id).first();

  if (!sub) return new Response("Upgrade required", { status: 403 });
}
```

Or use the auth client on server:

```js
const subscriptions = await authClient.customer.subscriptions.list({
  query: { active: true }
});
```

### Webhook Handling

- Plugin **auto-handles** signature validation — no manual `validateEvent` call needed.
- Webhook endpoint auto-registered at `/api/auth/polar/webhooks`.
- You register handlers in plugin config: `onOrderPaid`, `onCustomerStateChanged`, `onCheckoutCreated`, etc. (25+ handlers supported).
- Configure in Polar dashboard: webhook URL = `https://your-worker.dev/api/auth/polar/webhooks`.

Sources: [Better Auth Polar Docs](https://better-auth.com/docs/plugins/polar) | [Polar BetterAuth Adapter](https://polar.sh/docs/integrate/sdk/adapters/better-auth) | [polar-adapters GitHub](https://github.com/polarsource/polar-adapters/blob/main/packages/polar-betterauth/src/plugins/webhooks.ts) | [DEV Community](https://dev.to/phumudzosly/polarsh-betterauth-for-organizations-1j1b)

---

## Topic 3: Polar.sh SDK on CF Workers

### Setup

```bash
npm install @polar-sh/sdk
```

```js
import { Polar } from "@polar-sh/sdk";

const polar = new Polar({
  accessToken: env.POLAR_ACCESS_TOKEN,
  server: "production", // or "sandbox"
});
```

SDK is ESM, tree-shakeable, and explicitly serverless/edge-compatible. Works in CF Workers with no polyfills needed.

### Creating Checkouts

```js
const checkout = await polar.checkouts.create({
  productId: "prod_xxx",           // or productPriceId
  customerEmail: user.email,
  metadata: { userId: user.id },   // critical: link back to your user
  successUrl: "https://app.example.com/success",
});
// redirect user to checkout.url
return Response.redirect(checkout.url);
```

For organizations/tenants, pass `metadata: { userId, orgId }` to correlate on webhook receipt.

### Webhook Validation (without Better Auth plugin)

If handling webhooks manually (not via Better Auth plugin):

```js
import { validateEvent } from "@polar-sh/sdk/webhooks";

async function handleWebhook(req, env) {
  const body = await req.text();
  const headers = Object.fromEntries(req.headers);

  let event;
  try {
    event = validateEvent(body, headers, env.POLAR_WEBHOOK_SECRET);
  } catch (e) {
    return new Response("Invalid signature", { status: 403 });
  }

  switch (event.type) {
    case "subscription.created": /* ... */ break;
    case "subscription.active":  /* ... */ break;
    case "subscription.canceled":/* ... */ break;
    case "subscription.revoked": /* ... */ break;
  }
  return new Response("OK");
}
```

`validateEvent` is synchronous, uses HMAC-SHA256, throws on invalid signature.

### Key Webhook Events

| Event | Trigger | Action |
|---|---|---|
| `subscription.created` | User subscribes (may be in trial) | Create local sub record |
| `subscription.active` | Payment confirmed, access starts | Grant feature access |
| `subscription.canceled` | User cancels (access until period end) | Schedule revocation |
| `subscription.revoked` | Access immediately terminated | Remove access now |
| `subscription.uncanceled` | User resubscribes before period end | Restore access |
| `order.paid` | One-time purchase completed | Grant lifetime access |

### Customer Portal

```js
const session = await polar.customerSessions.create({
  customerId: polarCustomerId,
});
return Response.redirect(session.url); // self-service portal
```

Customers can: manage payment methods, view invoices, cancel/upgrade subscriptions. No UI to build.

With Better Auth plugin: `authClient.customer.portal()` wraps this automatically.

### CF Workers Specific Notes

- **Bot Fight Mode**: Polar webhook delivery will 403 if CF Bot Fight Mode is on. Fix: WAF bypass rule for webhook path, or disable Bot Fight Mode.
- SDK uses native `fetch()` — no Node.js http polyfills needed.
- Initialize `Polar` client inside the `fetch()` handler (or use `env` lazy-init pattern) to access `env` bindings.

Sources: [polar-sh/sdk npm](https://www.npmjs.com/package/@polar-sh/sdk) | [polar-js GitHub](https://github.com/polarsource/polar-js) | [Hookdeck Polar Webhooks Guide](https://hookdeck.com/webhooks/platforms/guide-to-polar-webhooks-features-and-best-practices) | [Polar Webhook Delivery Docs](https://polar.sh/docs/integrate/webhooks/delivery) | [OpenSaaS Polar Guide](https://docs.opensaas.sh/guides/payment-integrations/polar/)

---

## Ranked Recommendations

1. **Auth DB**: Use Drizzle adapter + D1 (not raw D1 binding) — gives schema control, custom columns for tenant data, type safety.
2. **Session**: Stick with cookie-based sessions in D1. Add KV cache only if cold-start latency becomes measurable.
3. **Billing sync**: Use Better Auth Polar plugin for webhook routing + signature validation; write sub status to your own `polar_subscription` table in `onCustomerStateChanged`. Don't query Polar API on every request.
4. **Checkout**: Create via SDK server-side, pass `metadata.userId` always. Correlate in webhook handler.

---

## Unresolved Questions

1. Exact `polar_subscription` schema from `@polar-sh/better-auth` v0.0.5+ — needs `npx better-auth generate` run against live plugin to confirm columns.
2. Whether Better Auth Polar plugin supports multi-tenant (per-org subscriptions) or only per-user — docs mention `referenceId: organizationId` for queries but setup flow unclear.
3. CF Workers D1 batch() performance under high concurrency — no published benchmarks for Better Auth's batch() usage patterns.
4. `better-auth-cloudflare` package maturity — small community project, abandonment risk unknown; safe to skip if scaffolding manually.
