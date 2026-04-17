/**
 * Billing service — subscription DB operations + plan derivation
 */

import { planFromProductId } from '../constants/products.js';

/**
 * Get active subscription for a user
 */
export async function getSubscription(db, userId) {
  return db.prepare(
    `SELECT ps.* FROM polar_subscription ps
     JOIN polar_customer pc ON pc.polarCustomerId = ps.polarCustomerId
     WHERE pc.userId = ? AND ps.status IN ('active', 'canceled')
     ORDER BY ps.createdAt DESC LIMIT 1`
  ).bind(userId).first();
}

/**
 * Upsert subscription record from Polar webhook
 */
export async function upsertSubscription(db, { polarCustomerId, productId, status, currentPeriodEnd }) {
  const existing = await db.prepare(
    'SELECT id FROM polar_subscription WHERE polarCustomerId = ?'
  ).bind(polarCustomerId).first();

  const ts = Math.floor(Date.now() / 1000);

  if (existing) {
    await db.prepare(
      `UPDATE polar_subscription SET productId = ?, status = ?, currentPeriodEnd = ?, updatedAt = ?
       WHERE polarCustomerId = ?`
    ).bind(productId, status, currentPeriodEnd, ts, polarCustomerId).run();
  } else {
    await db.prepare(
      `INSERT INTO polar_subscription (id, polarCustomerId, productId, status, currentPeriodEnd, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(crypto.randomUUID(), polarCustomerId, productId, status, currentPeriodEnd, ts, ts).run();
  }

  // Update user plan
  const customer = await db.prepare(
    'SELECT userId FROM polar_customer WHERE polarCustomerId = ?'
  ).bind(polarCustomerId).first();

  if (customer) {
    const plan = status === 'active' ? planFromProductId(productId) : 'free';
    await db.prepare('UPDATE "user" SET plan = ?, updatedAt = ? WHERE id = ?')
      .bind(plan, ts, customer.userId).run();
  }
}

/**
 * Cancel subscription (keep access until period end)
 */
export async function cancelSubscription(db, polarCustomerId, canceledAt) {
  const ts = Math.floor(Date.now() / 1000);
  await db.prepare(
    'UPDATE polar_subscription SET status = ?, canceledAt = ?, updatedAt = ? WHERE polarCustomerId = ?'
  ).bind('canceled', canceledAt || ts, ts, polarCustomerId).run();
}

/**
 * Revoke subscription — immediate downgrade to free
 */
export async function revokeSubscription(db, polarCustomerId) {
  const ts = Math.floor(Date.now() / 1000);
  await db.prepare(
    'UPDATE polar_subscription SET status = ?, updatedAt = ? WHERE polarCustomerId = ?'
  ).bind('revoked', ts, polarCustomerId).run();

  const customer = await db.prepare(
    'SELECT userId FROM polar_customer WHERE polarCustomerId = ?'
  ).bind(polarCustomerId).first();

  if (customer) {
    await db.prepare('UPDATE "user" SET plan = ?, updatedAt = ? WHERE id = ?')
      .bind('free', ts, customer.userId).run();
  }
}

/**
 * Get Polar customer by user ID
 */
export async function getCustomerByUserId(db, userId) {
  return db.prepare('SELECT * FROM polar_customer WHERE userId = ?').bind(userId).first();
}

/**
 * Get user's current plan string
 */
export async function getUserPlan(db, userId) {
  const row = await db.prepare('SELECT plan FROM "user" WHERE id = ?').bind(userId).first();
  return row?.plan || 'free';
}

/**
 * Get usage stats for billing page
 */
export async function getUsageStats(db, userId) {
  const streamCount = await db.prepare(
    'SELECT COUNT(*) as count FROM streams WHERE user_id = ?'
  ).bind(userId).first();

  const monthStart = Math.floor(new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime() / 1000);
  const runCount = await db.prepare(
    'SELECT COUNT(*) as count FROM run_history WHERE user_id = ? AND ran_at >= ?'
  ).bind(userId, monthStart).first();

  return {
    streams: streamCount?.count || 0,
    runsThisMonth: runCount?.count || 0,
  };
}
