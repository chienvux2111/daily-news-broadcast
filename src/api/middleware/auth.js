/**
 * Auth middleware — validates session cookie via Better Auth
 * Sets c.get('user') and c.get('session') for downstream handlers
 */

import { getAuth } from '../auth.js';

/**
 * Require authenticated session for protected routes
 * @returns {import('hono').MiddlewareHandler}
 */
export function requireAuth() {
  return async (c, next) => {
    try {
      const auth = getAuth(c.env);
      const session = await auth.api.getSession({ headers: c.req.raw.headers });
      if (!session?.user) {
        return c.json({ error: 'Unauthorized' }, 401);
      }
      c.set('user', session.user);
      c.set('session', session.session);
      await next();
    } catch (err) {
      console.error(`[Auth] Session check failed: ${err.message}`);
      return c.json({ error: 'Unauthorized' }, 401);
    }
  };
}
