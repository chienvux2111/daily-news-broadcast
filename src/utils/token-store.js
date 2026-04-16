/**
 * KVTokenStore — encrypted token storage in Cloudflare KV
 * Uses AES-256-GCM via Web Crypto API (available in CF Workers + Node 18+)
 */

export class KVTokenStore {
  /**
   * @param {Object} kvBinding - CF KV namespace binding
   * @param {string} encryptionKey - Base64-encoded 32-byte key
   */
  constructor(kvBinding, encryptionKey) {
    this._kv = kvBinding;
    this._keyB64 = encryptionKey;
    this._cryptoKey = null;
  }

  async _importKey() {
    if (this._cryptoKey) return this._cryptoKey;
    const raw = Uint8Array.from(atob(this._keyB64), c => c.charCodeAt(0));
    this._cryptoKey = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
    return this._cryptoKey;
  }

  async _encrypt(plaintext) {
    const key = await this._importKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(plaintext);
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
    // Prepend IV to ciphertext, base64 encode
    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(ciphertext), iv.length);
    return btoa(String.fromCharCode(...combined));
  }

  async _decrypt(b64) {
    const key = await this._importKey();
    const combined = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    return new TextDecoder().decode(decrypted);
  }

  /** @returns {string|null} Decrypted token or null */
  async getToken(channelId) {
    if (!this._kv) return null;
    const b64 = await this._kv.get(`token:${channelId}`);
    if (!b64) return null;
    try {
      return await this._decrypt(b64);
    } catch {
      console.log(`[TokenStore] decrypt failed for ${channelId}, token may be corrupted`);
      return null;
    }
  }

  /** Store encrypted token with optional TTL */
  async setToken(channelId, token, ttlMs) {
    if (!this._kv) return;
    const encrypted = await this._encrypt(token);
    const opts = ttlMs ? { expirationTtl: Math.floor(ttlMs / 1000) } : {};
    await this._kv.put(`token:${channelId}`, encrypted, opts);
  }

  async deleteToken(channelId) {
    if (this._kv) await this._kv.delete(`token:${channelId}`);
  }
}
