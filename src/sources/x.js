/**
 * Source Plugin: X / Twitter accounts
 * Fetches posts from a configured list of usernames via the official X API.
 */

import { SourcePlugin } from '../core/contracts.js';

const DEFAULT_CRYPTO_KEYWORDS = [
  'bitcoin', 'btc', 'ethereum', 'eth', 'solana', 'sol', 'bnb', 'binance',
  'xrp', 'doge', 'dogecoin', 'ton', 'toncoin', 'sui', 'aptos', 'defi',
  'airdrop', 'altcoin', 'stablecoin', 'usdt', 'usdc', 'on-chain', 'onchain',
  'etf', 'crypto', 'blockchain', 'web3', 'layer 2', 'l2', 'memecoin',
  'trading', 'market cap', 'liquidity', 'staking', 'yield', 'wallet',
  'exchange', 'futures', 'spot', 'long', 'short', 'take profit', 'stop loss',
];

export class XSource extends SourcePlugin {
  constructor(config = {}) {
    super();
    this._config = {
      usernames: [],
      cryptoKeywords: DEFAULT_CRYPTO_KEYWORDS,
      minEngagement: 25,
      maxResultsPerUser: 10,
      includeReplies: false,
      includeReposts: false,
      includeQuotes: true,
      ...config,
    };
  }

  get id() { return this._config.id || 'x-source'; }
  get name() { return this._config.name || 'X'; }
  get icon() { return this._config.icon || '𝕏'; }

  async fetch(options = {}) {
    const { limit = 10, since } = options;
    const bearerToken = this._config.bearerToken;
    const usernames = normalizeList(this._config.usernames);

    if (!bearerToken) throw new Error(`XSource "${this.id}" is missing bearerToken`);
    if (usernames.length === 0) return [];

    const authors = await this._fetchUsers(usernames, bearerToken);
    const articles = [];

    for (const author of authors) {
      const tweets = await this._fetchUserTweets(author, bearerToken);
      for (const tweet of tweets) {
        const article = this._tweetToArticle(tweet, author);
        if (!article) continue;
        if (since && article.publishedAt && article.publishedAt <= since) continue;
        articles.push(article);
      }
    }

    articles.sort((a, b) => {
      const scoreDiff = (b.meta?.engagementScore || 0) - (a.meta?.engagementScore || 0);
      if (scoreDiff !== 0) return scoreDiff;
      return new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime();
    });

    return articles.slice(0, limit);
  }

  async _fetchUsers(usernames, bearerToken) {
    const chunks = chunk(usernames, 100);
    const users = [];

    for (const batch of chunks) {
      const qs = new URLSearchParams({
        usernames: batch.join(','),
        'user.fields': 'description,name,profile_image_url,public_metrics,username,verified',
      });

      const response = await xFetch(`/2/users/by?${qs.toString()}`, bearerToken);
      const payload = await response.json();
      if (Array.isArray(payload.data)) users.push(...payload.data);
    }

    return users;
  }

  async _fetchUserTweets(author, bearerToken) {
    const qs = new URLSearchParams({
      max_results: String(clamp(this._config.maxResultsPerUser, 5, 100)),
      'tweet.fields': 'attachments,created_at,entities,lang,public_metrics,referenced_tweets',
      expansions: 'attachments.media_keys',
      'media.fields': 'preview_image_url,type,url',
    });

    const exclude = [];
    if (!this._config.includeReplies) exclude.push('replies');
    if (!this._config.includeReposts) exclude.push('retweets');
    if (exclude.length > 0) qs.set('exclude', exclude.join(','));

    const response = await xFetch(`/2/users/${author.id}/tweets?${qs.toString()}`, bearerToken);
    const payload = await response.json();
    const tweets = Array.isArray(payload.data) ? payload.data : [];
    const mediaByKey = new Map((payload.includes?.media || []).map(item => [item.media_key, item]));

    return tweets
      .filter(tweet => this._includeTweet(tweet))
      .map(tweet => ({ ...tweet, _mediaByKey: mediaByKey }));
  }

  _includeTweet(tweet) {
    if (!this._config.includeQuotes) {
      const refs = tweet.referenced_tweets || [];
      if (refs.some(ref => ref.type === 'quoted')) return false;
    }

    const text = extractTweetText(tweet);
    const matchedKeywords = findMatchedKeywords(text, this._config.cryptoKeywords);
    if (matchedKeywords.length === 0) return false;

    const engagement = computeEngagement(tweet.public_metrics);
    return engagement >= this._config.minEngagement;
  }

  _tweetToArticle(tweet, author) {
    const text = extractTweetText(tweet);
    if (!text) return null;

    const matchedKeywords = findMatchedKeywords(text, this._config.cryptoKeywords);
    const engagement = computeEngagement(tweet.public_metrics);
    const url = `https://x.com/${author.username}/status/${tweet.id}`;
    const media = pickMedia(tweet._mediaByKey, tweet.attachments?.media_keys || []);

    return {
      id: `x:${author.username}:${tweet.id}`,
      title: summarizeTitle(text),
      url,
      content: text,
      source: `X / @${author.username}`,
      category: 'X Signals',
      author: author.name || author.username,
      imageUrl: media?.url || media?.preview_image_url || undefined,
      publishedAt: tweet.created_at ? new Date(tweet.created_at) : null,
      meta: {
        icon: this.icon,
        platform: 'x',
        username: author.username,
        verified: !!author.verified,
        matchedKeywords,
        engagementScore: engagement,
        likes: tweet.public_metrics?.like_count || 0,
        reposts: tweet.public_metrics?.retweet_count || 0,
        replies: tweet.public_metrics?.reply_count || 0,
        quotes: tweet.public_metrics?.quote_count || 0,
        reactions: (tweet.public_metrics?.like_count || 0) + (tweet.public_metrics?.retweet_count || 0) + (tweet.public_metrics?.quote_count || 0),
        comments: tweet.public_metrics?.reply_count || 0,
      },
    };
  }
}

function extractTweetText(tweet) {
  return (tweet.note_tweet?.text || tweet.text || '').replace(/\s+/g, ' ').trim();
}

function summarizeTitle(text) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= 110) return normalized;
  const cut = normalized.slice(0, 107);
  const lastSpace = cut.lastIndexOf(' ');
  return `${cut.slice(0, lastSpace > 60 ? lastSpace : cut.length)}...`;
}

function pickMedia(mediaByKey, mediaKeys) {
  for (const key of mediaKeys) {
    const media = mediaByKey.get(key);
    if (media?.url || media?.preview_image_url) return media;
  }
  return null;
}

function computeEngagement(metrics = {}) {
  const likes = metrics.like_count || 0;
  const reposts = metrics.retweet_count || 0;
  const replies = metrics.reply_count || 0;
  const quotes = metrics.quote_count || 0;
  return likes + reposts * 2 + replies * 2 + quotes * 2.5;
}

function normalizeList(value) {
  if (Array.isArray(value)) return value.map(v => `${v}`.trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(',').map(v => v.trim()).filter(Boolean);
  return [];
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findMatchedKeywords(text, keywords) {
  const haystack = (text || '').toLowerCase();
  return normalizeList(keywords).filter(keyword => {
    const normalized = keyword.toLowerCase();
    if (normalized.startsWith('$')) return haystack.includes(normalized);
    const re = new RegExp(`(^|[^a-z0-9])${escapeRegex(normalized)}([^a-z0-9]|$)`, 'i');
    return re.test(haystack);
  });
}

function chunk(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

async function xFetch(path, bearerToken) {
  const response = await fetch(`https://api.x.com${path}`, {
    headers: {
      Authorization: `Bearer ${bearerToken}`,
      'User-Agent': 'NewsEngine/2.0',
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`X API ${response.status}: ${body}`);
  }

  return response;
}
