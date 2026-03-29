/**
 * Cache implementations
 */

import { CachePlugin } from './contracts.js';

const DEFAULT_TTL = 7 * 24 * 60 * 60 * 1000;

// ============================================
// In-Memory (works everywhere, no persistence)
// ============================================

export class MemoryCache extends CachePlugin {
  constructor() { super(); this._store = new Map(); }

  async get(key) {
    const entry = this._store.get(key);
    if (!entry) return null;
    if (entry.exp && Date.now() > entry.exp) { this._store.delete(key); return null; }
    return entry.v;
  }

  async set(key, value, ttl = DEFAULT_TTL) {
    this._store.set(key, { v: value, exp: ttl ? Date.now() + ttl : null });
  }

  async delete(key) { this._store.delete(key); }
}

// ============================================
// File-based (Node.js / Bun)
// ============================================

export class FileCache extends CachePlugin {
  constructor(path = './.cache/news.json') { super(); this._path = path; this._data = null; }

  async _load() {
    if (this._data) return this._data;
    try {
      const fs = await import('node:fs/promises');
      const { dirname } = await import('node:path');
      await fs.mkdir(dirname(this._path), { recursive: true });
      this._data = JSON.parse(await fs.readFile(this._path, 'utf-8'));
    } catch { this._data = {}; }
    return this._data;
  }

  async _save() {
    const fs = await import('node:fs/promises');
    await fs.writeFile(this._path, JSON.stringify(this._data, null, 2));
  }

  async get(key) {
    const d = await this._load();
    const e = d[key];
    if (!e) return null;
    if (e.exp && Date.now() > e.exp) { delete d[key]; await this._save(); return null; }
    return e.v;
  }

  async set(key, value, ttl = DEFAULT_TTL) {
    const d = await this._load();
    d[key] = { v: value, exp: ttl ? Date.now() + ttl : null };
    await this._save();
  }

  async delete(key) {
    const d = await this._load();
    delete d[key];
    await this._save();
  }
}

// ============================================
// Cloudflare KV
// ============================================

export class CloudflareKVCache extends CachePlugin {
  constructor(kvBinding) { super(); this._kv = kvBinding; }

  async get(key) {
    if (!this._kv) return null;
    return await this._kv.get(key);
  }

  async set(key, value, ttl = DEFAULT_TTL) {
    if (!this._kv) return;
    await this._kv.put(key, typeof value === 'string' ? value : JSON.stringify(value), {
      expirationTtl: Math.floor(ttl / 1000),
    });
  }

  async delete(key) { if (this._kv) await this._kv.delete(key); }
}

// ============================================
// Redis
// ============================================

export class RedisCache extends CachePlugin {
  constructor(url = 'redis://localhost:6379') { super(); this._url = url; this._client = null; }

  async _connect() {
    if (this._client) return this._client;
    const { createClient } = await import('redis');
    this._client = createClient({ url: this._url });
    await this._client.connect();
    return this._client;
  }

  async get(key) { return (await this._connect()).get(key); }
  async set(key, value, ttl = DEFAULT_TTL) {
    (await this._connect()).set(key, typeof value === 'string' ? value : JSON.stringify(value), {
      EX: Math.floor(ttl / 1000),
    });
  }
  async delete(key) { (await this._connect()).del(key); }
  async disconnect() { if (this._client) await this._client.quit(); }
}
