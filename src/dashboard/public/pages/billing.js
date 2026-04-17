/**
 * Billing page — current plan, usage stats, upgrade/manage buttons
 */

import { html, api, toast } from '../app.js';
import { useState, useEffect } from 'https://esm.sh/preact@10.25.4/hooks';

const PLAN_FEATURES = {
  free: { name: 'Free', price: '$0/mo', features: ['1 stream', '2 sources/stream', 'Telegram only', 'Groq AI'] },
  pro: { name: 'Pro', price: '$15/mo', features: ['5 streams', '10 sources/stream', 'All outputs', 'GPT-4o, Claude, Gemini'] },
  business: { name: 'Business', price: '$39/mo', features: ['Unlimited streams', 'Unlimited sources', 'All outputs', 'All AI providers'] },
};

export default function Billing() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api('/billing/plan')
      .then(setData)
      .catch(err => toast(err.message, 'error'))
      .finally(() => setLoading(false));
  }, []);

  // Check for upgrade success redirect
  useEffect(() => {
    if (location.hash.includes('upgraded=true')) {
      toast('Plan upgraded successfully!', 'success');
      history.replaceState(null, '', location.pathname + '#/billing');
    }
  }, []);

  if (loading) return html`<div class="container" style="text-align:center;padding:48px"><div class="spinner"></div></div>`;

  const currentPlan = data?.plan || 'free';
  const usage = data?.usage || {};

  return html`
    <div class="container" style="max-width:720px;margin:0 auto;padding:24px">
      <h2 style="margin-bottom:20px">Billing</h2>

      <!-- Current plan card -->
      <div style="padding:20px;border:2px solid var(--primary);border-radius:10px;margin-bottom:24px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div>
            <span style="font-size:13px;color:var(--text-dim)">Current Plan</span>
            <h3 style="margin:4px 0">${PLAN_FEATURES[currentPlan]?.name || 'Free'}</h3>
          </div>
          <span style="font-size:20px;font-weight:700">${PLAN_FEATURES[currentPlan]?.price || '$0/mo'}</span>
        </div>
        <div style="margin-top:12px;display:flex;gap:16px;font-size:13px;color:var(--text-dim)">
          <span>${usage.streams || 0} streams used</span>
          <span>${usage.runsThisMonth || 0} runs this month</span>
        </div>
        ${currentPlan !== 'free' && html`
          <a href="/api/billing/portal" style="display:inline-block;margin-top:12px;font-size:13px;color:var(--primary)">
            Manage Billing
          </a>
        `}
      </div>

      <!-- Plan comparison -->
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">
        ${Object.entries(PLAN_FEATURES).map(([key, plan]) => html`
          <div key=${key} style="padding:16px;border:1px solid ${key === currentPlan ? 'var(--primary)' : 'var(--border)'};border-radius:8px">
            <h4 style="margin-bottom:4px">${plan.name}</h4>
            <div style="font-size:18px;font-weight:700;margin-bottom:12px">${plan.price}</div>
            <ul style="list-style:none;padding:0;margin:0;font-size:13px">
              ${plan.features.map(f => html`<li style="padding:3px 0;color:var(--text-dim)">${f}</li>`)}
            </ul>
            ${key === currentPlan
              ? html`<div style="margin-top:12px;text-align:center;font-size:13px;color:var(--text-dim)">Current</div>`
              : key !== 'free' && html`
                <a href=${`/api/billing/checkout?plan=${key}`}
                  style="display:block;margin-top:12px;text-align:center;padding:8px;border:none;border-radius:6px;background:var(--primary);color:#fff;text-decoration:none;font-weight:600;font-size:13px">
                  Upgrade
                </a>
              `
            }
          </div>
        `)}
      </div>
    </div>
  `;
}
