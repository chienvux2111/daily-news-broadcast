/**
 * Output Plugin: X (Twitter)
 * Uses OAuth 2.0 Bearer token (stored in KVTokenStore or direct)
 * Supports single tweet and threaded tweets (1/n, 2/n pattern)
 */

import { OutputPlugin } from '../core/contracts.js';

const X_API = 'https://api.x.com/2/tweets';
const MAX_TWEET = 280;
const MAX_TWEETS_PER_THREAD = 10;

export class XOutput extends OutputPlugin {
  /**
   * @param {Object} config
   * @param {string} [config.accessToken] - OAuth 2.0 Bearer token (direct)
   * @param {Object} [config.kvTokenStore] - KVTokenStore instance for encrypted token
   * @param {string} [config.channelId] - Channel ID for KV token lookup
   */
  constructor(config) {
    super();
    this._accessToken = config.accessToken;
    this._kvStore = config.kvTokenStore;
    this._channelId = config.channelId;
  }

  get id() { return 'x'; }
  get name() { return 'X (Twitter)'; }
  get maxLength() { return MAX_TWEET * MAX_TWEETS_PER_THREAD; }

  /** Resolve token from direct config or KV store */
  async _getToken() {
    if (this._accessToken) return this._accessToken;
    if (this._kvStore && this._channelId) {
      const token = await this._kvStore.getToken(this._channelId);
      if (!token) throw new Error(`X token not found in KV for ${this._channelId}`);
      return token;
    }
    throw new Error('XOutput: no accessToken or kvTokenStore configured');
  }

  /**
   * Refresh OAuth 2.0 token using refresh_token
   * @param {Object} kvStore - KVTokenStore
   * @param {string} channelId
   * @param {string} refreshToken
   * @param {string} clientId - X app client ID
   */
  static async refreshToken(kvStore, channelId, refreshToken, clientId) {
    const res = await fetch('https://api.x.com/2/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`X token refresh failed: ${data.error_description || res.status}`);

    // Store new access token (2h expiry)
    await kvStore.setToken(channelId, data.access_token, data.expires_in * 1000);
    // Store new refresh token (6 months) — X rotates refresh tokens
    if (data.refresh_token) {
      await kvStore.setToken(`${channelId}:refresh`, data.refresh_token, 180 * 24 * 3600 * 1000);
    }
    console.log(`[X] Token refreshed for ${channelId}, expires in ${data.expires_in}s`);
    return data;
  }

  async send(content) {
    const token = await this._getToken();
    const tweets = splitIntoTweets(content);
    let replyToId = null;
    let firstId = null;

    for (let i = 0; i < tweets.length; i++) {
      const body = { text: tweets[i] };
      if (replyToId) body.reply = { in_reply_to_tweet_id: replyToId };

      const res = await fetch(X_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (res.status === 429) {
        throw new Error('X rate limit exceeded');
      }
      if (res.status === 403 && data.detail?.includes('duplicate')) {
        console.log(`[X] Duplicate tweet skipped: ${tweets[i].substring(0, 40)}...`);
        return { success: true, messageId: firstId, meta: { duplicate: true } };
      }
      if (!res.ok) {
        throw new Error(`X API error ${res.status}: ${JSON.stringify(data)}`);
      }

      replyToId = data.data.id;
      if (i === 0) firstId = replyToId;

      // Brief delay between thread tweets to avoid rate issues
      if (i < tweets.length - 1) await sleep(500);
    }

    return {
      success: true,
      messageId: firstId,
      meta: { tweetCount: tweets.length },
    };
  }
}

/**
 * Split content into tweet-sized segments
 * Detects thread format (1/n, 2/n) or treats as single tweet
 */
function splitIntoTweets(content) {
  // Try to split by thread numbering pattern: "1/n", "2/n" etc
  const segments = content.split(/\n\n+/).filter(s => s.trim());
  const hasThreadFormat = segments.length > 1 && /^\d+\/\d+/.test(segments[0].trim());

  const tweets = hasThreadFormat ? segments : [content];

  return tweets
    .slice(0, MAX_TWEETS_PER_THREAD)
    .map(t => t.trim())
    .map(t => t.length > MAX_TWEET ? t.substring(0, MAX_TWEET - 1) + '…' : t)
    .filter(t => t.length > 0);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
