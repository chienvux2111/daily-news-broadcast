# 🔥 NewsEngine — Portable Tech News Aggregator

Plugin-based news aggregation engine. Fetch từ bất kỳ nguồn nào, tóm tắt bằng bất kỳ AI nào, gửi đến bất kỳ đâu.

**Zero lock-in.** Swap sources, AI models, output channels bằng 1 dòng code.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                       NewsEngine                             │
│                                                             │
│  ┌─ Sources ──────┐   ┌─ AI ────────┐   ┌─ Outputs ─────┐ │
│  │ RSS/Atom       │   │ Claude      │   │ Telegram      │ │
│  │ HTML Scraper   │──▶│ OpenAI      │──▶│ Slack         │ │
│  │ Hacker News    │   │ Groq        │   │ Discord       │ │
│  │ Reddit         │   │ Gemini      │   │ Email         │ │
│  │ Dev.to         │   │ Ollama      │   │ Webhook       │ │
│  │ JSON API (any) │   │ OpenRouter  │   │ Markdown File │ │
│  │ [Your Plugin]  │   │ Together    │   │ [Your Plugin] │ │
│  └────────────────┘   │ [Your own]  │   └───────────────┘ │
│                       └─────────────┘                       │
│         ┌─ Cache ─────────┐   ┌─ Middleware ──────┐        │
│         │ Memory          │   │ Filter by keyword │        │
│         │ File (JSON)     │   │ Deduplicate       │        │
│         │ Redis           │   │ Score / rank      │        │
│         │ Cloudflare KV   │   │ [Your transform]  │        │
│         └─────────────────┘   └───────────────────┘        │
└─────────────────────────────────────────────────────────────┘
```

## Quick Start

### 1. Install

```bash
npm install
cp .env.example .env
# Edit .env with your tokens
```

### 2. Run

```bash
# One-time run
node src/adapters/node.js run

# Daemon mode with cron schedule
node src/adapters/node.js cron

# Preview (fetch + summarize, no send)
node src/adapters/node.js preview

# Deploy to Cloudflare Workers
wrangler deploy
```

### 3. Or use as library

```javascript
import { NewsEngine, FileCache } from './src/core/index.js';
import { bigTechBlogs } from './src/presets/index.js';
import { ClaudeAI } from './src/ai/index.js';
import { TelegramOutput } from './src/outputs/index.js';

const engine = new NewsEngine()
  .addSource(...bigTechBlogs())
  .useAI(new ClaudeAI({ apiKey: process.env.ANTHROPIC_API_KEY }))
  .addOutput(new TelegramOutput({
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    chatId: process.env.TELEGRAM_CHAT_ID,
  }))
  .useCache(new FileCache())
  .configure({ language: 'vi', style: 'digest' });

await engine.run();
```

## Project Structure

```
src/
├── core/                        # Engine core — platform agnostic
│   ├── contracts.js             # 4 plugin interfaces: Source, AI, Output, Cache
│   ├── engine.js                # Orchestrator (fluent builder API)
│   ├── caches.js                # Memory, File, Cloudflare KV, Redis
│   └── index.js                 # Barrel exports
│
├── sources/                     # Data source plugins
│   ├── rss.js                   # RSS/Atom feed parser (zero deps)
│   ├── html-scraper.js          # HTML scraper for blogs without RSS
│   ├── hackernews.js            # Hacker News (Algolia API)
│   ├── reddit.js                # Reddit (public JSON API)
│   ├── devto.js                 # Dev.to API + generic JSONAPISource
│   └── index.js
│
├── ai/                          # AI summarization plugins
│   ├── claude.js                # Anthropic Claude (native API)
│   ├── openai-compat.js         # OpenAI-compatible: GPT, Groq, Gemini, Ollama, etc.
│   ├── _prompts.js              # Shared prompt templates (digest/bullet/thread/newsletter)
│   └── index.js
│
├── outputs/                     # Output channel plugins
│   ├── telegram.js              # Telegram Bot API (auto-split, markdown fallback)
│   ├── channels.js              # Slack, Discord, Email, Webhook, Markdown file
│   └── index.js
│
├── presets/                     # Pre-configured source bundles
│   └── index.js                 # bigTechBlogs(), communitySources(), aiMLBlogs(), etc.
│
├── adapters/                    # Runtime adapters
│   ├── cloudflare.js            # Cloudflare Worker (cron + HTTP)
│   └── node.js                  # Node.js CLI + daemon mode
│
├── Dockerfile
├── docker-compose.yml
├── wrangler.toml
└── .env.example
```

## Plugin System

### Contracts (Interfaces)

Every plugin extends one of 4 base classes from `src/core/contracts.js`:

| Contract | Methods | Purpose |
|----------|---------|---------|
| `SourcePlugin` | `.fetch(options)` → `Article[]` | Lấy articles từ bất kỳ nguồn nào |
| `AIPlugin` | `.summarize(articles, options)` → `SummaryResult` | Xử lý / tóm tắt bằng bất kỳ model nào |
| `OutputPlugin` | `.send(content, options)` → `SendResult` | Gửi kết quả đến bất kỳ đâu |
| `CachePlugin` | `.get()` `.set()` `.has()` `.delete()` | Dedup & state management |

### Article Schema

Mọi source plugin trả về articles theo schema thống nhất:

```javascript
{
  id: string,            // Unique ID (thường là URL)
  title: string,         // Tiêu đề
  url: string,           // Link gốc
  content: string,       // Nội dung / mô tả (plain text)
  source: string,        // Tên nguồn
  category?: string,     // Phân loại
  author?: string,       // Tác giả
  publishedAt?: Date,    // Ngày xuất bản
  meta?: object,         // Metadata tuỳ ý (points, comments, icon, etc.)
}
```

## Available Plugins

### Sources

| Plugin | Auth | Description |
|--------|------|-------------|
| `RSSSource` | ❌ | RSS/Atom feed — dùng cho hầu hết blog |
| `HTMLScraperSource` | ❌ | HTML scraper — cho blog không có RSS |
| `HackerNewsSource` | ❌ | HN Algolia API — filter by points, query |
| `RedditSource` | ❌ | Reddit JSON API — filter by subreddit, upvotes |
| `DevToSource` | ❌ | Dev.to API — filter by tag, reactions |
| `JSONAPISource` | ⚙️ | Generic JSON API — custom transform function |

### AI Providers

| Plugin | Factory helper | Description |
|--------|---------------|-------------|
| `ClaudeAI` | — | Anthropic Claude (native API) |
| `OpenAICompatibleAI` | `openai()` | OpenAI GPT models |
| | `groq()` | Groq (ultra-fast inference) |
| | `gemini()` | Google Gemini |
| | `ollama()` | Ollama (local, offline) |
| | `openRouter()` | OpenRouter (model marketplace) |
| | `togetherAI()` | Together AI |

### Outputs

| Plugin | Description |
|--------|-------------|
| `TelegramOutput` | Telegram Bot API (auto-split >4096 chars, markdown fallback) |
| `SlackOutput` | Slack Incoming Webhook |
| `DiscordOutput` | Discord Webhook (auto-split >2000 chars) |
| `EmailOutput` | Email via Resend or SendGrid |
| `WebhookOutput` | Generic HTTP POST webhook |
| `MarkdownFileOutput` | Save as `.md` file (for static sites, GitHub) |

### Caches

| Plugin | Persistence | Best for |
|--------|-------------|----------|
| `MemoryCache` | ❌ In-memory | Testing, serverless |
| `FileCache` | ✅ JSON file | Local dev, Docker, VPS |
| `RedisCache` | ✅ Redis | Production, multi-instance |
| `CloudflareKVCache` | ✅ CF KV | Cloudflare Workers |

### Presets (Source Bundles)

| Preset | Sources | Description |
|--------|---------|-------------|
| `bigTechBlogs()` | 15 sources | Uber, Meta, Netflix, AWS, Cloudflare, etc. |
| `communitySources()` | 4 sources | HN, r/programming, r/ExperiencedDevs, Dev.to |
| `aiMLBlogs()` | 5 sources | OpenAI, DeepMind, HuggingFace, r/ML, HN AI |
| `devopsSources()` | 4 sources | Cloudflare, HashiCorp, r/devops, Dev.to |
| `mobileSources()` | 4 sources | Android Developers, r/androiddev, r/iOS, Dev.to |

## Usage Examples

### Minimal — 15 blogs → Claude → Telegram

```javascript
import { NewsEngine, FileCache } from './src/core/index.js';
import { bigTechBlogs } from './src/presets/index.js';
import { ClaudeAI } from './src/ai/index.js';
import { TelegramOutput } from './src/outputs/index.js';

const engine = new NewsEngine()
  .addSource(...bigTechBlogs())
  .useAI(new ClaudeAI({ apiKey: 'sk-ant-...' }))
  .addOutput(new TelegramOutput({ botToken: '...', chatId: '-100...' }))
  .useCache(new FileCache());

await engine.run();
```

### Multi-output — gửi song song Telegram + Slack + Discord

```javascript
engine
  .addOutput(new TelegramOutput({ botToken: '...', chatId: '...' }))
  .addOutput(new SlackOutput({ webhookUrl: 'https://hooks.slack.com/...' }))
  .addOutput(new DiscordOutput({ webhookUrl: 'https://discord.com/api/webhooks/...' }));
```

### Swap AI — thay Claude bằng Groq (free, ultra-fast)

```javascript
import { groq } from './src/ai/index.js';

engine.useAI(groq('gsk_...'));
```

### Swap AI — chạy offline với Ollama

```javascript
import { ollama } from './src/ai/index.js';

engine.useAI(ollama('llama3.2'));
```

### Custom sources — mix presets + manual

```javascript
import { bigTechBlogs, communitySources } from './src/presets/index.js';
import { RSSSource, RedditSource } from './src/sources/index.js';

engine
  .addSource(...bigTechBlogs())
  .addSource(...communitySources())
  .addSource(new RSSSource({
    id: 'my-blog', name: 'My Company Blog',
    feedUrl: 'https://blog.mycompany.com/feed.xml',
    icon: '🏢', category: 'Internal',
  }))
  .addSource(new RedditSource({ subreddit: 'kotlin', minUpvotes: 30 }));
```

### Middleware — filter & transform articles before AI

```javascript
engine
  // Chỉ giữ bài có keyword liên quan
  .use(articles => articles.filter(a =>
    /kubernetes|docker|terraform/i.test(a.title + a.content)
  ))
  // Custom scoring
  .use(articles => articles.sort((a, b) =>
    (b.meta?.points || 0) - (a.meta?.points || 0)
  ).slice(0, 20));
```

### Newsletter style thay vì digest

```javascript
engine.configure({ language: 'vi', style: 'newsletter' });
// Styles: 'digest' | 'bullet' | 'thread' | 'newsletter'
```

### Dry run — preview không gửi

```javascript
const result = await engine.run({ dryRun: true });
console.log(result.content); // Xem digest content
console.log(result.stats);   // { sources: 15, articles: 23, ... }
```

## Writing Custom Plugins

### Custom Source

```javascript
import { SourcePlugin } from './src/core/contracts.js';

class NotionSource extends SourcePlugin {
  constructor(config) {
    super();
    this._config = config;
  }

  get id() { return 'notion'; }
  get name() { return 'Notion Database'; }
  get icon() { return '📓'; }

  async fetch(options = {}) {
    const { limit = 10 } = options;
    const res = await fetch(`https://api.notion.com/v1/databases/${this._config.databaseId}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this._config.apiKey}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ page_size: limit }),
    });
    const data = await res.json();
    return data.results.map(page => ({
      id: page.id,
      title: page.properties.Name?.title?.[0]?.plain_text || '',
      url: page.url,
      content: '',
      source: this.name,
    }));
  }
}
```

### Custom AI Provider

```javascript
import { AIPlugin } from './src/core/contracts.js';
import { buildPrompt } from './src/ai/_prompts.js';

class MyLocalAI extends AIPlugin {
  get id() { return 'local-ai'; }
  get name() { return 'My Local Model'; }

  async summarize(articles, options = {}) {
    const prompt = buildPrompt(articles, options);
    const res = await fetch('http://localhost:8080/v1/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: `${prompt.system}\n\n${prompt.user}`, max_tokens: 4096 }),
    });
    const data = await res.json();
    return { text: data.choices[0].text, model: 'local' };
  }
}
```

### Custom Output

```javascript
import { OutputPlugin } from './src/core/contracts.js';

class ZaloOutput extends OutputPlugin {
  get id() { return 'zalo'; }
  get name() { return 'Zalo OA'; }
  get maxLength() { return 2000; }

  async send(content) {
    const res = await fetch('https://openapi.zalo.me/v3.0/oa/message/cs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'access_token': this._config.accessToken,
      },
      body: JSON.stringify({
        recipient: { user_id: this._config.userId },
        message: { text: content },
      }),
    });
    return { success: res.ok };
  }
}
```

## Deployment Options

### Node.js (any VPS / Railway / Render / Fly.io)

```bash
node src/adapters/node.js cron
```

### Docker

```bash
docker compose up -d
```

### Cloudflare Workers

```bash
wrangler secret put TELEGRAM_BOT_TOKEN
wrangler secret put TELEGRAM_CHAT_ID
wrangler secret put ANTHROPIC_API_KEY
wrangler deploy
```

### AWS Lambda / Vercel / any serverless

```javascript
import { NewsEngine, MemoryCache } from './src/core/index.js';
// ... setup engine
export const handler = async () => engine.run();
```

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Per output | Telegram bot token |
| `TELEGRAM_CHAT_ID` | Per output | Telegram chat/channel ID |
| `ANTHROPIC_API_KEY` | Per AI | Claude API key |
| `OPENAI_API_KEY` | Per AI | OpenAI API key |
| `GROQ_API_KEY` | Per AI | Groq API key |
| `CACHE_TYPE` | ❌ | `file` / `redis` / `memory` (default: `file`) |
| `CACHE_PATH` | ❌ | File cache path (default: `.cache/news.json`) |
| `REDIS_URL` | ❌ | Redis connection URL |
| `CRON_SCHEDULE` | ❌ | Cron expression (default: `0 7 * * *` = 14:00 VN) |
| `SUMMARY_LANGUAGE` | ❌ | `vi` / `en` (default: `vi`) |
| `MAX_ARTICLES_PER_SOURCE` | ❌ | Default: `3` |
| `CONCURRENCY_LIMIT` | ❌ | Parallel fetch limit (default: `5`) |

### Engine Options

```javascript
engine.configure({
  concurrency: 5,              // Parallel source fetch
  maxArticlesPerSource: 5,     // Max articles per source
  language: 'vi',              // Summary language
  style: 'digest',             // digest | bullet | thread | newsletter
  since: new Date('2025-01-01'), // Only articles after this date
});
```

## Cost Estimate

| Component | Cost |
|-----------|------|
| Claude API (Sonnet) | ~$0.003–0.01 / digest |
| Groq (free tier) | $0 (rate limited) |
| Ollama (local) | $0 (your hardware) |
| Cloudflare Worker | Free tier (100k req/day) |
| Telegram Bot API | Free |

## License

MIT
