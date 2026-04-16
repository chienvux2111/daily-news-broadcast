/**
 * Output Plugin: Threads (Meta)
 * Two-step flow: create container → publish
 * Long-lived token stored encrypted in KVTokenStore (refresh every 50 days)
 */

import { OutputPlugin } from '../core/contracts.js';

const THREADS_API = 'https://graph.threads.net/v1.0';

export class ThreadsOutput extends OutputPlugin {
  /**
   * @param {Object} config
   * @param {string} [config.accessToken] - Direct access token
   * @param {string} config.userId - Threads user ID
   * @param {Object} [config.kvTokenStore] - KVTokenStore for encrypted token
   * @param {string} [config.channelId] - Channel ID for KV lookup
   */
  constructor(config) {
    super();
    this._accessToken = config.accessToken;
    this._userId = config.userId;
    this._kvStore = config.kvTokenStore;
    this._channelId = config.channelId;
  }

  get id() { return 'threads'; }
  get name() { return 'Threads'; }
  get maxLength() { return 500; }

  async _getToken() {
    if (this._accessToken) return this._accessToken;
    if (this._kvStore && this._channelId) {
      const token = await this._kvStore.getToken(this._channelId);
      if (!token) throw new Error(`Threads token not found in KV for ${this._channelId}`);
      return token;
    }
    throw new Error('ThreadsOutput: no accessToken or kvTokenStore configured');
  }

  async send(content) {
    const token = await this._getToken();
    const text = content.length > 500 ? content.substring(0, 497) + '...' : content;

    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Bearer ${token}`,
    };

    // Step 1: Create container
    const createRes = await fetch(`${THREADS_API}/${this._userId}/threads`, {
      method: 'POST',
      headers,
      body: new URLSearchParams({ media_type: 'TEXT', text }).toString(),
    });

    const createData = await createRes.json();
    if (!createRes.ok) {
      if (createRes.status === 429) throw new Error('Threads rate limit: 250 posts/24h exceeded');
      throw new Error(`Threads create error ${createRes.status}: ${createData.error?.message || JSON.stringify(createData)}`);
    }

    // Step 2: Publish
    const pubRes = await fetch(`${THREADS_API}/${this._userId}/threads_publish`, {
      method: 'POST',
      headers,
      body: new URLSearchParams({ creation_id: createData.id }).toString(),
    });

    const pubData = await pubRes.json();
    if (!pubRes.ok) {
      console.error(`[Threads] Container ${createData.id} created but publish failed — will auto-expire in 24h`);
      throw new Error(`Threads publish error ${pubRes.status}: ${pubData.error?.message || JSON.stringify(pubData)}`);
    }

    return {
      success: true,
      messageId: pubData.id,
    };
  }

  /**
   * Refresh long-lived token (call every ~50 days, token expires at 60 days)
   * @param {Object} kvStore - KVTokenStore
   * @param {string} channelId
   */
  static async refreshToken(kvStore, channelId) {
    const currentToken = await kvStore.getToken(channelId);
    if (!currentToken) throw new Error(`No Threads token found for ${channelId}`);

    const res = await fetch(`${THREADS_API}/refresh_access_token?` + new URLSearchParams({
      grant_type: 'th_refresh_token',
      access_token: currentToken,
    }));

    const data = await res.json();
    if (!res.ok) {
      throw new Error(`Threads token refresh failed: ${data.error?.message || res.status}`);
    }

    await kvStore.setToken(channelId, data.access_token, data.expires_in * 1000);
    console.log(`[Threads] Token refreshed for ${channelId}, expires in ${data.expires_in}s`);
    return data;
  }
}
