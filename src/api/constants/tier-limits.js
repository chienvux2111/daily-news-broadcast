/**
 * Feature tier limits — defines what each plan can access
 */

export const TIER_LIMITS = {
  free: {
    maxStreams: 1,
    maxSourcesPerStream: 2,
    allowedOutputs: ['telegram'],
    allowedAI: ['groq'],
    customSchedule: false,
  },
  pro: {
    maxStreams: 5,
    maxSourcesPerStream: 10,
    allowedOutputs: ['telegram', 'discord', 'slack', 'webhook', 'email'],
    allowedAI: ['groq', 'openai', 'claude', 'gemini'],
    customSchedule: true,
  },
  business: {
    maxStreams: -1,
    maxSourcesPerStream: -1,
    allowedOutputs: '*',
    allowedAI: '*',
    customSchedule: true,
  },
};

/**
 * Get limits for a user's subscription plan
 * @param {Object|null} subscription - polar_subscription row
 * @returns {Object} tier limits
 */
export function getLimitsForPlan(plan) {
  return TIER_LIMITS[plan] || TIER_LIMITS.free;
}
