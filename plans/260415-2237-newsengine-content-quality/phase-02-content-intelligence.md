---
phase: 2
priority: high
status: pending
effort: M
blockedBy: [phase-01]
---

# Phase 2: Content Intelligence

## Overview
Add article scoring/ranking, semantic dedup, and category grouping. These transform the raw article list into a curated, organized collection before AI summarization.

## Items
1. Article scoring & ranking middleware
2. Semantic dedup (title similarity)
3. Category grouping before AI

---

## 1. Article Scoring & Ranking

### Problem
Articles are processed in fetch order. No intelligence selects the most interesting ones. A Netflix engineering post with deep insights gets same weight as a random Dev.to listicle.

### Solution
Create `src/core/scoring.js` — a built-in middleware factory that scores + sorts articles.

### Files
- **Create:** `src/core/scoring.js`
- **Modify:** `src/core/index.js` — export scoring

### Scoring Formula

```
score = engagementScore + recencyScore + credibilityScore
```

**Engagement** (0-40 points):
```js
const engagement = Math.min(40, Math.log10(1 + (meta.points || 0) + (meta.upvotes || 0)) * 10
  + Math.log10(1 + (meta.comments || 0)) * 5);
```

**Recency** (0-30 points):
```js
const hoursAgo = (Date.now() - publishedAt) / 3600000;
const recency = Math.max(0, 30 - hoursAgo * 1.25); // 0 after 24h
```

**Source Credibility** (0-30 points):
```js
const CREDIBILITY = {
  'Big Tech': 30,      // Netflix, Uber, Meta, etc.
  'Cloud': 25,         // AWS, Cloudflare
  'Developer Tools': 25, // GitHub, Vercel
  'AI/ML': 25,
  'Fintech': 20,
  'Community': 15,     // HN, Reddit, Dev.to
  'default': 10,
};
```

### API

```js
import { createScoringMiddleware } from './src/core/scoring.js';

engine.use(createScoringMiddleware({
  maxArticles: 20,           // Keep top N after scoring
  credibilityWeights: {},    // Override defaults
}));
```

The middleware:
1. Calculates score for each article
2. Stores score in `article.meta.score`
3. Sorts descending by score
4. Slices to `maxArticles`

---

## 2. Semantic Dedup

### Problem
Same story appears from HN + Reddit + RSS (e.g., "OpenAI releases GPT-5" reported by 3+ sources). Current dedup only checks exact URL match.

### Solution
Create `src/core/semantic-dedup.js` — title similarity using bigram comparison (no external deps).

### Files
- **Create:** `src/core/semantic-dedup.js`
- **Modify:** `src/core/index.js` — export

### Algorithm: Bigram Similarity (Dice coefficient)
Zero dependencies. Fast. Good enough for title matching.

```js
function bigrams(str) {
  const normalized = str.toLowerCase().replace(/[^a-z0-9\s]/g, '');
  const words = normalized.split(/\s+/);
  const bg = new Set();
  for (const w of words) {
    for (let i = 0; i < w.length - 1; i++) bg.add(w.slice(i, i + 2));
  }
  return bg;
}

function similarity(a, b) {
  const bgA = bigrams(a);
  const bgB = bigrams(b);
  const intersection = [...bgA].filter(x => bgB.has(x)).length;
  return (2 * intersection) / (bgA.size + bgB.size);
}
```

### Dedup Logic

```js
export function createSemanticDedupMiddleware(options = {}) {
  const { threshold = 0.65 } = options;
  
  return (articles) => {
    const kept = [];
    for (const article of articles) {
      const isDuplicate = kept.some(existing => 
        similarity(existing.title, article.title) > threshold
      );
      if (!isDuplicate) {
        kept.push(article);
      } else {
        // Merge: keep higher-scored version, note duplicate sources
        const match = kept.find(e => similarity(e.title, article.title) > threshold);
        if (match && (article.meta?.score || 0) > (match.meta?.score || 0)) {
          // Replace with higher-scored version
          const idx = kept.indexOf(match);
          kept[idx] = { ...article, meta: { ...article.meta, alsoFrom: [...(match.meta?.alsoFrom || []), match.source] } };
        } else if (match) {
          match.meta = { ...match.meta, alsoFrom: [...(match.meta?.alsoFrom || []), article.source] };
        }
      }
    }
    return kept;
  };
}
```

### Key Decision
- Threshold 0.65 (conservative to avoid false positives)
- When duplicates found: keep higher-scored version, track `meta.alsoFrom` for multi-source attribution
- Runs AFTER scoring middleware so scores are available for choosing winner

---

## 3. Category Grouping

### Problem
Articles are sent to AI as a flat list. No structure. Digest reads like a random dump.

### Solution
Create `src/core/grouping.js` — groups articles by category, creates structured input for AI.

### Files
- **Create:** `src/core/grouping.js`
- **Modify:** `src/ai/_prompts.js` — update `buildPrompt()` to accept grouped articles
- **Modify:** `src/core/index.js` — export

### Grouping Logic

```js
export function groupByCategory(articles) {
  const groups = {};
  for (const article of articles) {
    const cat = article.category || 'General';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(article);
  }
  // Sort groups by total score (highest first)
  return Object.entries(groups)
    .sort(([, a], [, b]) => {
      const scoreA = a.reduce((sum, x) => sum + (x.meta?.score || 0), 0);
      const scoreB = b.reduce((sum, x) => sum + (x.meta?.score || 0), 0);
      return scoreB - scoreA;
    });
}
```

### Prompt Integration
Update `buildPrompt()` to format grouped articles:

```
=== Infrastructure & Cloud ===
1. [☁️ AWS] "New S3 Express One Zone..." ...
2. [🔶 Cloudflare] "Workers AI update..." ...

=== AI/ML ===
3. [🤖 OpenAI] "GPT-5 release..." ...
```

This gives AI structured input to produce sectioned output.

### API
Grouping is built into `buildPrompt()` automatically when articles have categories. No user config needed.

---

## Success Criteria
- [ ] Scoring middleware ranks articles by engagement + recency + credibility
- [ ] Semantic dedup catches duplicate stories across sources (test: same HN + Reddit story)
- [ ] Category grouping produces structured prompt sections
- [ ] All three work as composable middlewares: `engine.use(scoring).use(semanticDedup)`
- [ ] Grouping integrates transparently into `buildPrompt()`

## Todo
- [ ] Create `src/core/scoring.js` with `createScoringMiddleware()`
- [ ] Create `src/core/semantic-dedup.js` with `createSemanticDedupMiddleware()`
- [ ] Create `src/core/grouping.js` with `groupByCategory()`
- [ ] Update `src/ai/_prompts.js` — grouped article formatting in `buildPrompt()`
- [ ] Export all from `src/core/index.js`
- [ ] Test: verify scoring order, dedup detection, grouped prompt output
