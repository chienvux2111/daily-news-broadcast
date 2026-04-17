/**
 * Feature gate middleware — enforces tier limits on protected routes
 */

import { getLimitsForPlan } from '../constants/tier-limits.js';

/**
 * Get user's active plan from D1
 * @param {Object} db - D1 binding
 * @param {string} userId
 * @returns {Promise<string>} plan name
 */
async function getUserPlan(db, userId) {
  const row = await db.prepare('SELECT plan FROM "user" WHERE id = ?').bind(userId).first();
  return row?.plan || 'free';
}

/**
 * Feature gate factory — runs a check function against user's tier limits
 * @param {(c: Context, limits: Object) => Promise<{blocked: boolean, reason?: string}>} check
 * @returns {import('hono').MiddlewareHandler}
 */
export function featureGate(check) {
  return async (c, next) => {
    const user = c.get('user');
    const plan = await getUserPlan(c.env.DB, user.id);
    const limits = getLimitsForPlan(plan);

    const result = await check(c, limits);
    if (result.blocked) {
      return c.json({ error: result.reason, plan, upgrade: true }, 403);
    }

    c.set('limits', limits);
    c.set('plan', plan);
    await next();
  };
}
