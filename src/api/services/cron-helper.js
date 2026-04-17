/**
 * Lightweight cron helper — computes next occurrence from a 5-field cron expression
 * Supports: *, */N, single values, comma-separated, ranges
 */

/**
 * Get the next Unix timestamp (seconds) when a cron expression should fire
 * Looks ahead up to 48 hours from now
 * @param {string} cronExpr - 5-field cron: "min hour dom month dow"
 * @returns {number|null} Unix epoch seconds, or null if unparseable
 */
export function nextCronOccurrence(cronExpr) {
  if (!cronExpr) return null;
  const fields = cronExpr.trim().split(/\s+/);
  if (fields.length !== 5) return null;

  const now = new Date();
  // Start from next minute
  const candidate = new Date(now);
  candidate.setUTCSeconds(0, 0);
  candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);

  // Scan up to 48h (2880 minutes)
  for (let i = 0; i < 2880; i++) {
    const min = candidate.getUTCMinutes();
    const hour = candidate.getUTCHours();
    const dom = candidate.getUTCDate();
    const month = candidate.getUTCMonth() + 1;
    const dow = candidate.getUTCDay();

    if (
      matchField(fields[0], min) &&
      matchField(fields[1], hour) &&
      matchField(fields[2], dom) &&
      matchField(fields[3], month) &&
      matchField(fields[4], dow)
    ) {
      return Math.floor(candidate.getTime() / 1000);
    }

    candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);
  }

  return null;
}

/** Match a single cron field against a value */
function matchField(field, value) {
  if (field === '*') return true;
  if (field.startsWith('*/')) {
    const n = parseInt(field.slice(2));
    return n > 0 ? value % n === 0 : false;
  }
  return field.split(',').some(part => {
    if (part.includes('-')) {
      const [lo, hi] = part.split('-').map(Number);
      return value >= lo && value <= hi;
    }
    return parseInt(part) === value;
  });
}
