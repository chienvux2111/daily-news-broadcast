# System Architecture

## Overview

NewsEngine is a plugin-based news aggregation system with a composable pipeline architecture. Every component (source, AI, output, cache) is a swappable plugin registered at runtime.

## Core Architecture

```
                        ┌──────────────────────┐
                        │     Runtime Adapter   │
                        │  (Cloudflare / Node)  │
                        └──────────┬───────────┘
                                   │
                        ┌──────────▼───────────┐
                        │   Channel System      │
                        │  definitions.js       │
                        │  runner.js            │
                        └──────────┬───────────┘
                                   │ per channel
                        ┌──────────▼───────────┐
                        │     NewsEngine        │
                        │  (core/engine.js)     │
                        └──────────┬───────────┘
                                   │
           ┌───────────┬───────────┼───────────┬────────────┐
           ▼           ▼           ▼           ▼            ▼
      ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐
      │ Sources │ │  Cache  │ │Middleware│ │   AI    │ │ Outputs │
      └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘
```

## Pipeline Flow

Each engine run follows this sequence:

```
1. Check cache → already sent today? → skip
2. _fetchAll() → parallel fetch from all sources (batched by concurrency, 500ms delay)
3. _dedup() → filter already-sent articles via cache
4. Middlewares → user-injected transforms:
   ├── createScoringMiddleware() → score & rank by engagement/recency/credibility
   ├── createSemanticDedupMiddleware() → remove cross-source duplicates (bigram similarity)
   └── custom (articles) => articles transforms
5. ai.summarize() → with audience context, grouped articles, platform rules
   └── secondary language digest (if secondaryLanguage configured)
6. output.send() → parallel to all outputs (auto-truncate to maxLength)
7. _markSent() → cache article IDs
```

### Drip Mode (Alternative)

Instead of sending all articles at once, drip mode sends `batchSize` articles per cron run:

```
1. Fetch → Dedup → Score/Rank (same as above)
2. Take first `batchSize` unsent articles
3. Summarize batch only
4. Send → Mark sent
5. Remaining articles wait for next cron trigger
```

## Plugin System

### Contracts (core/contracts.js)

Four abstract base classes define the plugin interfaces:

| Contract | Key Method | Returns |
|----------|-----------|---------|
| `SourcePlugin` | `fetch(options)` | `Article[]` |
| `AIPlugin` | `summarize(articles, options)` | `{ text, usage?, model? }` |
| `OutputPlugin` | `send(content, options)` | `{ success, messageId?, error? }` |
| `CachePlugin` | `get(key)`, `set(key, value, ttl)` | cache operations |

Engine validates plugin types at registration time (`instanceof` check).

### Article Schema

All source plugins return articles in this unified schema:

```
{ id, title, url, content, source, category?, author?, publishedAt?, imageUrl?, meta? }
```

## Multi-Channel Architecture

The channel system (`src/channels/`) allows running multiple independent engine instances, each with its own schedule, sources, AI config, output, and prompt style.

```
defineChannels(env)
  │
  ├── telegram-main   (drip mode, 3x/day, vi, hot_take, dev/indie builders)
  ├── x-tech-vn       (drip mode, 3x/day, vi, hot_take)
  ├── fb-ai-vn        (drip mode, 3x/day, vi, hot_take)
  └── threads-dev-vn  (drip mode, 2x/day, vi, hot_take)
```

Each channel:
- Gets a **PrefixedCache** (`news:{channelId}:*`) for isolated dedup state
- Has independent cron schedule checked by `shouldRun(cronExpr, now)`
- Runs sequentially to avoid resource contention
- Uses **platform-specific prompt rules** via `platform-rules.js`

### Channel Activation

Channels activate automatically when their required env vars are present:
- Telegram: `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`
- X/Twitter: `X_CLIENT_ID` + `TOKEN_ENCRYPTION_KEY` + KV namespace
- Facebook: `FB_PAGE_TOKEN` + `FB_PAGE_ID`
- Threads: `THREADS_USER_ID` + `TOKEN_ENCRYPTION_KEY` + KV namespace

## Dashboard (Config-Driven)

The dashboard (`src/dashboard/`) provides a web UI for monitoring and managing streams defined in `streams.config.json`.

```
streams.config.json
  │
  ├── config-loader.js  → parse, resolve $ENV_VAR references
  ├── scheduler.js      → node-cron job management
  ├── stream-runner.js  → build & run engine per stream
  └── server.js         → Express HTTP server
       ├── GET /api/streams        → list streams + status
       ├── POST /api/streams/:id/run → manual trigger
       ├── GET /api/runs           → run history
       └── GET /api/events         → SSE live updates
```

## AI Prompt System

`ai/_prompts.js` exports `buildPrompt()` which generates `{system, user}` prompt pairs:

- **Language**: `vi` / `en` with locale-specific editorial voice
- **Style**: `digest` / `hot_take` / `bullet` / `thread` / `newsletter` / `weekly` / `mustread`
- **Audience**: injected into system prompt for tone calibration
- **Platform**: platform-specific formatting rules appended (from `platform-rules.js`)
- **Grouping**: articles auto-grouped by category when mixed categories detected

## Deployment Targets

| Target | Adapter | Cache | Notes |
|--------|---------|-------|-------|
| Cloudflare Workers | `adapters/cloudflare.js` | CloudflareKVCache | Cron trigger + HTTP endpoints |
| Node.js (VPS/Docker) | `adapters/node.js` | FileCache / RedisCache | CLI: run / cron / preview |
| Dashboard (Node.js) | `dashboard/server.js` | FileCache | Express + SSE, config-driven |
| Serverless (Lambda/Vercel) | Custom | MemoryCache | Wrap `engine.run()` in handler |

## Security Model

- All credentials externalized to environment variables
- OAuth tokens (X, Threads) stored encrypted in Cloudflare KV via `KVTokenStore`
- `TRIGGER_SECRET` guards manual trigger endpoints on Cloudflare Workers
- No secrets in source code or git history
- Platform tokens use provider-recommended auth flows (System User tokens for Facebook, OAuth 2.0 for X/Threads)

## Presets

Pre-configured source bundles in `src/presets/index.js` simplify common use cases:

| Preset | Sources | Use Case |
|--------|---------|----------|
| `bigTechBlogs()` | 15 RSS sources | Engineering blogs from Uber, Meta, Netflix, AWS, Cloudflare, GitHub, Google, Stripe, Airbnb, LinkedIn, Spotify, Dropbox, Shopify, Vercel, Mozilla |
| `communitySources()` | 5 sources | Hacker News, Reddit (programming, ExperiencedDevs), Dev.to, GitHub Trending |
| `aiMLBlogs()` | 5 sources | OpenAI, DeepMind, Hugging Face RSS + Reddit (MachineLearning), Hacker News (AI/LLM) |
| `aiNewsSources()` | 8 sources | Daily AI industry news: TechCrunch, The Verge, Ars Technica, VentureBeat + Reddit (LocalLLaMA, singularity, artificial) + Hacker News AI query |
| `aiDeepDiveSources()` | 6 sources | Weekly technical deep-dives: Simon Willison, Lilian Weng, Latent Space, Ahead of AI, One Useful Thing, Import AI |
| `devopsSources()` | 4 sources | DevOps: Cloudflare, HashiCorp RSS + Reddit (devops), Dev.to (devops tag) |
| `mobileSources()` | 4 sources | Mobile: Android Developers, Swift.org RSS + Reddit (androiddev, iOSProgramming) |

Each preset returns a `SourcePlugin[]` array, spread into `.addSource()` when building an engine or stream.

## Data Flow Summary

```
[RSS/HN/Reddit/Dev.to/GitHub] → fetch → Article[]
  → cache dedup → scoring middleware → semantic dedup middleware
  → AI summarize (with platform rules + audience + language)
  → output.send() to [Telegram/X/Facebook/Threads/Slack/Discord/...]
  → cache mark sent
```
