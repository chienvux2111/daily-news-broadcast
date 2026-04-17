# Project Overview — NewsEngine

## Summary

NewsEngine is a plugin-based news aggregation engine that fetches articles from any data source, summarizes them with any AI model, and sends results to any output channel. Designed for zero lock-in — every component is a swappable plugin.

## Problem Statement

Developers and teams need curated tech news digests delivered to their preferred channels (Telegram, X, Slack, etc.) on a schedule. Existing solutions are either monolithic, locked to one platform, or require complex infrastructure.

## Solution

A composable engine with:
- **Plugin registry pattern** — sources, AI, outputs, caches are all interchangeable
- **Multi-channel support** — same engine powers Telegram, X, Facebook, Threads, Slack, Discord simultaneously
- **Two delivery modes** — digest (all at once) and drip (batch articles over time)
- **Config-driven streams** — define pipelines in JSON, no code changes needed
- **Platform-agnostic core** — runs on Cloudflare Workers, Node.js, Docker, or any serverless platform

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Runtime | Node.js 18+ / Cloudflare Workers |
| Language | JavaScript (ES Modules, JSDoc types) |
| Dashboard | Express 5 + vanilla JS SPA |
| Caching | File JSON / Redis / Cloudflare KV / Memory |
| AI | Any OpenAI-compatible API + Anthropic native |
| Deployment | Cloudflare Workers / Docker / VPS / Serverless |

## Key Features

1. **7 source plugins** — RSS, HTML scraper, HN, Reddit, Dev.to, GitHub Trending, JSON API
2. **10 AI providers** — Claude, OpenAI, Groq, Gemini, Qwen, DeepSeek, Ollama, OpenRouter, Together, Custom
3. **9 output plugins** — Telegram, X, Facebook, Threads, Slack, Discord, Email, Webhook, Markdown
4. **Content intelligence** — scoring, semantic dedup, category grouping
5. **6 prompt styles** — digest, bullet, thread, newsletter, weekly, mustread
6. **Platform-specific formatting** — auto-adapts content for each output platform
7. **Web dashboard** — config-driven monitoring with SSE live updates
8. **Bilingual support** — primary + secondary language digests

## Architecture Principles

- Engine core never imports from plugin directories
- Fluent builder API for programmatic use
- Config-driven for operational use (streams.config.json)
- Zero external dependencies for core logic
- All parsing via regex (Cloudflare Worker compatible)

## Target Users

- Developers wanting automated tech news digests
- Teams needing multi-channel content distribution
- Content creators publishing to multiple social platforms
- Anyone building custom news aggregation pipelines
