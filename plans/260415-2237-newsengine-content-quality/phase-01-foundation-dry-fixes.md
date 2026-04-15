---
phase: 1
priority: high
status: pending
effort: S
---

# Phase 1: Foundation & DRY Fixes

## Overview
Extract duplicated code, add retry logic for source fetches, and add rate limiting awareness for Reddit. These are non-breaking foundation fixes that later phases build on.

## Items
1. Extract `createAI()` to shared module
2. Source fetch retry with exponential backoff
3. Reddit rate limiting awareness

---

## 1. Extract `createAI()` — DRY Fix

### Problem
`createAI()` is duplicated (~60 lines) in `src/adapters/node.js` and `src/adapters/cloudflare.js`. Adding a new AI provider requires editing both files.

### Solution
Create `src/ai/create-ai.js` with a shared factory function.

### Files to Modify
- **Create:** `src/ai/create-ai.js` — shared factory
- **Modify:** `src/adapters/node.js` — import from factory
- **Modify:** `src/adapters/cloudflare.js` — import from factory
- **Modify:** `src/ai/index.js` — re-export factory

### Implementation

```js
// src/ai/create-ai.js
import { ClaudeAI, openai, groq, gemini, qwen, deepseek, ollama, openRouter, togetherAI, OpenAICompatibleAI } from './index.js';

/**
 * Create AI plugin from config object
 * @param {Object} config - { provider, model, apiKey, baseUrl, name }
 * @returns {AIPlugin|null}
 */
export function createAI(config) {
  const { provider = 'claude', model, ...rest } = config;
  
  switch (provider.toLowerCase()) {
    case 'none': case 'off': case 'skip':
      return null;
    case 'claude': case 'anthropic':
      return new ClaudeAI({ apiKey: rest.apiKey, ...(model && { model }) });
    case 'openai':
      return openai(rest.apiKey, model || 'gpt-4o-mini');
    case 'groq':
      return groq(rest.apiKey, model || 'llama-3.3-70b-versatile');
    // ... all other providers
    default:
      throw new Error(`Unknown AI provider: "${provider}"`);
  }
}
```

**Node adapter becomes:**
```js
import { createAI } from '../ai/create-ai.js';

const ai = createAI({
  provider: env('AI_PROVIDER', 'claude'),
  model: env('AI_MODEL'),
  apiKey: process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY, // etc
});
```

**Cloudflare adapter becomes:**
```js
import { createAI } from '../ai/create-ai.js';

const ai = createAI({
  provider: env.AI_PROVIDER || 'claude',
  model: env.AI_MODEL,
  apiKey: env.ANTHROPIC_API_KEY,
});
```

### Key Decision
The factory takes a flat config object (not `process.env`), so it works in both Node and Cloudflare. Each adapter maps its own env format to the config shape.

---

## 2. Source Fetch Retry

### Problem
In `engine.js:238-263`, if a source fetch fails (timeout, network error), all articles from that source are lost. No retry.

### Solution
Add retry with exponential backoff inside `_fetchAll()`. Max 2 retries, delays: 1s, 2s.

### Files to Modify
- **Modify:** `src/core/engine.js` — add `_fetchWithRetry()` method

### Implementation

```js
// Add to NewsEngine class in engine.js

async _fetchWithRetry(source, options, maxRetries = 2) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const articles = await source.fetch(options);
      return articles.map(a => ({
        ...a,
        id: a.id || a.url || `${a.source}:${a.title}`,
        source: a.source || source.name,
      }));
    } catch (err) {
      if (attempt === maxRetries) {
        this.logger(`[Engine] ✗ ${source.name} failed after ${maxRetries + 1} attempts: ${err.message}`);
        return [];
      }
      const delay = 1000 * (attempt + 1);
      this.logger(`[Engine] ⟳ ${source.name} retry ${attempt + 1}/${maxRetries} in ${delay}ms`);
      await sleep(delay);
    }
  }
  return [];
}
```

**Update `_fetchAll()`** to call `_fetchWithRetry()` instead of inline fetch:
```js
const results = await Promise.allSettled(
  batch.map(source => this._fetchWithRetry(source, { limit: maxArticlesPerSource, since }))
);
```

### Config
Add `options.maxRetries` (default 2) to engine config. Exposed via `.configure({ maxRetries: 3 })`.

---

## 3. Reddit Rate Limiting

### Problem
Reddit rate-limits unauthenticated API requests. High concurrency can trigger 429 responses.

### Solution
Add response status check + retry-after handling in `RedditSource.fetch()`.

### Files to Modify
- **Modify:** `src/sources/reddit.js` — add rate limit handling

### Implementation

```js
// In RedditSource.fetch()
const response = await fetch(url, {
  headers: { 'User-Agent': 'NewsEngine/2.0 (news aggregator)' },
});

// Handle rate limiting
if (response.status === 429) {
  const retryAfter = parseInt(response.headers.get('retry-after') || '5');
  await new Promise(r => setTimeout(r, retryAfter * 1000));
  // Single retry after waiting
  const retry = await fetch(url, {
    headers: { 'User-Agent': 'NewsEngine/2.0 (news aggregator)' },
  });
  if (!retry.ok) return [];
  const data = await retry.json();
  // ... same processing
}
```

**Also:** Update User-Agent to be more descriptive (Reddit recommends this to avoid throttling).

---

## Success Criteria
- [ ] `createAI()` exists in one place only, both adapters import it
- [ ] Source fetch retries on failure (verify with a mock timeout)
- [ ] Reddit handles 429 gracefully without crashing
- [ ] All existing functionality unchanged (no breaking changes)

## Todo
- [ ] Create `src/ai/create-ai.js`
- [ ] Update `src/ai/index.js` barrel export
- [ ] Refactor `src/adapters/node.js` to use factory
- [ ] Refactor `src/adapters/cloudflare.js` to use factory
- [ ] Add `_fetchWithRetry()` to `src/core/engine.js`
- [ ] Update `_fetchAll()` to use retry
- [ ] Add rate limit handling to `src/sources/reddit.js`
- [ ] Test: `node src/adapters/node.js preview`
