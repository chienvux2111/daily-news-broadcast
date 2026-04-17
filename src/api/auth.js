/**
 * Better Auth configuration factory with Polar billing plugin
 * Lazy singleton — initialized once per CF Worker isolate
 */

import { betterAuth } from 'better-auth';
import { polar } from '@polar-sh/better-auth';
import { Polar } from '@polar-sh/sdk';
import { upsertSubscription, cancelSubscription, revokeSubscription } from './services/billing-service.js';
import { planFromProductId } from './constants/products.js';

let _auth = null;
let _envHash = null;

/**
 * Compute a simple hash of critical env keys to detect env changes
 * @param {Object} env
 */
function envFingerprint(env) {
  return `${env.APP_URL}:${env.GOOGLE_CLIENT_ID || ''}`;
}

/**
 * Get or create Better Auth instance (lazy singleton per isolate)
 * @param {Object} env - CF Worker env bindings
 * @returns {ReturnType<typeof betterAuth>}
 */
export function getAuth(env) {
  const fp = envFingerprint(env);
  if (_auth && _envHash === fp) return _auth;

  const polarClient = env.POLAR_ACCESS_TOKEN
    ? new Polar({ accessToken: env.POLAR_ACCESS_TOKEN })
    : null;

  const plugins = [];
  if (polarClient && env.POLAR_WEBHOOK_SECRET) {
    plugins.push(polar({
      client: polarClient,
      createCustomerOnSignUp: true,
      enableCustomerPortal: true,
      checkout: { enabled: true },
      webhooks: {
        secret: env.POLAR_WEBHOOK_SECRET,
        onCustomerStateChanged: async (payload) => {
          const data = payload.event?.data;
          if (!data) return;
          console.log(`[Auth] Polar customer state: ${data.status} (${data.customerId})`);
          try {
            if (data.status === 'active') {
              await upsertSubscription(env.DB, {
                polarCustomerId: data.customerId,
                productId: data.productId,
                status: 'active',
                currentPeriodEnd: data.currentPeriodEnd ? Math.floor(new Date(data.currentPeriodEnd).getTime() / 1000) : null,
              });
            } else if (data.status === 'canceled') {
              await cancelSubscription(env.DB, data.customerId, data.canceledAt ? Math.floor(new Date(data.canceledAt).getTime() / 1000) : null);
            } else if (data.status === 'revoked') {
              await revokeSubscription(env.DB, data.customerId);
            }
          } catch (err) {
            console.error(`[Auth] Webhook handler error: ${err.message}`);
          }
        },
        onOrderPaid: async (payload) => {
          console.log(`[Auth] Polar order paid: ${payload.event?.data?.id}`);
        },
      },
    }));
  }

  _auth = betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    database: { db: env.DB, type: 'sqlite' },
    baseURL: env.APP_URL || 'http://localhost:8787',
    emailAndPassword: { enabled: true },
    socialProviders: {
      ...(env.GOOGLE_CLIENT_ID && {
        google: {
          clientId: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
        },
      }),
    },
    plugins,
  });

  _envHash = fp;
  return _auth;
}
