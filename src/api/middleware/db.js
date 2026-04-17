/**
 * D1 database helper — wraps env.DB with FK enforcement and tenant-scoped queries
 */

let _fkEnabled = false;

/**
 * Create a thin D1 wrapper with auto foreign keys and tenant safety
 * @param {Object} d1 - env.DB (Cloudflare D1 binding)
 * @returns {Object} wrapped db with query helpers
 */
export function createDB(d1) {
  return {
    raw: d1,

    /** Enable foreign keys once per isolate lifecycle */
    async ensureFK() {
      if (_fkEnabled) return;
      await d1.prepare('PRAGMA foreign_keys = ON').run();
      _fkEnabled = true;
    },

    /**
     * Execute a prepared statement
     * @param {string} sql
     * @param {...any} params
     */
    async query(sql, ...params) {
      await this.ensureFK();
      return d1.prepare(sql).bind(...params).all();
    },

    /**
     * Execute and return first row
     * @param {string} sql
     * @param {...any} params
     */
    async queryFirst(sql, ...params) {
      await this.ensureFK();
      return d1.prepare(sql).bind(...params).first();
    },

    /**
     * Execute a write statement (INSERT/UPDATE/DELETE)
     * @param {string} sql
     * @param {...any} params
     */
    async execute(sql, ...params) {
      await this.ensureFK();
      return d1.prepare(sql).bind(...params).run();
    },

    /**
     * Tenant-scoped query — warns if user_id not in SQL
     * @param {string} userId
     * @param {string} sql
     * @param {...any} params
     */
    async queryForUser(userId, sql, ...params) {
      if (!sql.includes('user_id')) {
        console.warn(`[DB] queryForUser called without user_id in SQL: ${sql.substring(0, 80)}`);
      }
      await this.ensureFK();
      return d1.prepare(sql).bind(...params).all();
    },
  };
}
