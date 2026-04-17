/**
 * Billing routes — checkout, portal, plan info
 */

import { Hono } from 'hono';
import { Polar } from '@polar-sh/sdk';
import { PRODUCTS } from '../constants/products.js';
import { getSubscription, getCustomerByUserId, getUserPlan, getUsageStats } from '../services/billing-service.js';
import { getLimitsForPlan } from '../constants/tier-limits.js';

const billing = new Hono();

// Current plan + usage stats
billing.get('/plan', async (c) => {
  const user = c.get('user');
  const plan = await getUserPlan(c.env.DB, user.id);
  const limits = getLimitsForPlan(plan);
  const usage = await getUsageStats(c.env.DB, user.id);
  const subscription = await getSubscription(c.env.DB, user.id);

  return c.json({ plan, limits, usage, subscription });
});

// Create Polar checkout → redirect to payment page
billing.get('/checkout', async (c) => {
  const user = c.get('user');
  const plan = c.req.query('plan');
  const product = PRODUCTS[plan];

  if (!product) return c.json({ error: 'Invalid plan. Use "pro" or "business"' }, 400);
  if (!c.env.POLAR_ACCESS_TOKEN) return c.json({ error: 'Billing not configured' }, 503);

  const polar = new Polar({ accessToken: c.env.POLAR_ACCESS_TOKEN });
  const checkout = await polar.checkouts.create({
    productId: product.id,
    customerEmail: user.email,
    metadata: { userId: user.id },
    successUrl: `${c.env.APP_URL || 'http://localhost:8787'}/app#/?upgraded=true`,
  });

  return c.redirect(checkout.url);
});

// Customer portal → redirect to Polar self-service
billing.get('/portal', async (c) => {
  const user = c.get('user');
  const customer = await getCustomerByUserId(c.env.DB, user.id);
  if (!customer) return c.json({ error: 'No billing account found' }, 404);
  if (!c.env.POLAR_ACCESS_TOKEN) return c.json({ error: 'Billing not configured' }, 503);

  const polar = new Polar({ accessToken: c.env.POLAR_ACCESS_TOKEN });
  const session = await polar.customerSessions.create({
    customerId: customer.polarCustomerId,
  });

  return c.redirect(session.url);
});

export { billing };
