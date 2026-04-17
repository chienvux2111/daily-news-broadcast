# Code Standards — NewsEngine SaaS

**Last updated:** April 17, 2026

## Language & Runtime

- **Language:** JavaScript (ES Modules only, no TypeScript)
- **Runtime:** Node.js 18+ (Cloud Workers compatible)
- **Module system:** `import` / `export` (no `require`)
- **Package.json:** `"type": "module"` (required)
- **No build step** — code runs directly

## Naming Conventions

### Files & Directories

- **Directories:** `kebab-case` (e.g., `src/api/routes/`, `src/dashboard/public/`)
- **Files:** `kebab-case.js` for utilities, `index.js` for barrel exports
  - ✅ `stream-service.js`, `queue-producer.js`, `rate-limit.js`
  - ❌ `StreamService.js`, `QueueProducer.js`

### Variables & Functions

- **Constants:** `SCREAMING_SNAKE_CASE` (e.g., `MAX_ARTICLES`, `DEFAULT_TIMEOUT`)
- **Regular variables:** `camelCase` (e.g., `userId`, `streamConfig`)
- **Functions:** `camelCase` (e.g., `createStream()`, `summarizeArticles()`)
- **Boolean functions:** Prefix with `is` or `has` (e.g., `isActive()`, `hasErrors()`)

### Classes & Types

- **Classes:** `PascalCase` (e.g., `NewsEngine`, `SourcePlugin`, `RSSSource`)
- **Abstract base classes:** `PascalCase` (e.g., `OutputPlugin`)
- **Factory functions:** `camelCase` (e.g., `createAI()`, `groq()`)

### React/Preact Components

- **Components:** `PascalCase` (e.g., `StreamBuilder`, `RunHistory`)
- **Component files:** `PascalCase.jsx` (e.g., `StreamBuilder.jsx`)

## Code Structure

### Module Organization

**Barrel exports (`index.js`):**
```javascript
// src/outputs/index.js
export { TelegramOutput } from './telegram.js';
export { SlackOutput, DiscordOutput } from './channels.js';
export { EmailOutput, WebhookOutput } from './channels.js';
```

**One class per file, unless tightly coupled:**
```
✅ src/outputs/telegram.js        → TelegramOutput class only
✅ src/outputs/channels.js        → 5 related output classes
❌ src/outputs/telegram.js        → TelegramOutput + SlackOutput (unrelated)
```

### File Size Limits

- **Core modules:** <200 LOC (contracts, engine, caches)
- **Services:** <250 LOC per service
- **Route handlers:** <150 LOC per endpoint group
- **Utility functions:** <100 LOC

**When to split:**
- Service exceeds 250 LOC → split by concern (e.g., `stream-service.js`, `stream-validation.js`)
- Route file exceeds 150 LOC → create separate files per endpoint group
- Component exceeds 200 LOC → extract sub-components

### Function Size

- **Target:** <30 LOC per function
- **Maximum:** <50 LOC (with reasonable nesting)
- **Signs of refactoring needed:**
  - Nested conditionals (3+ levels)
  - Multiple concerns (parsing + validation + persistence)
  - Reusable logic (extract to utility)

## Error Handling

### Try/Catch Strategy

**Fetch operations (sources) — Non-fatal:**
```javascript
async fetch(options = {}) {
  try {
    const res = await fetch(this._url);
    return await res.json();
  } catch (err) {
    console.error(`[${this.id}] Fetch failed: ${err.message}`);
    return []; // Return empty array, don't crash
  }
}
```

**API operations — Throw for invalid input, catch for external failures:**
```javascript
export async function createStream(db, userId, { name, config }) {
  // Validate early (throw)
  if (!name?.trim()) throw new Error('Stream name required');
  if (!config?.sources?.length) throw new Error('At least 1 source required');

  try {
    const id = uuid();
    await db.prepare(
      'INSERT INTO streams (id, user_id, name, config, ...) VALUES (?, ?, ?, ?, ...)'
    ).bind(id, userId, name, JSON.stringify(config), ...).run();
    return { id, name, ...config };
  } catch (err) {
    console.error(`[Stream] Create failed: ${err.message}`);
    throw new Error('Database error');
  }
}
```

**Output operations (send) — Throw on failure:**
```javascript
async send(content) {
  try {
    const res = await fetch(this._webhookUrl, {
      method: 'POST',
      body: JSON.stringify({ text: content }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { success: true };
  } catch (err) {
    throw new Error(`Webhook send failed: ${err.message}`);
  }
}
```

### Error Messages

**Format:** `[Context] What went wrong: details`

```javascript
console.error(`[RSSSource] Feed parse failed: Invalid XML at line 42`);
console.error(`[TelegramOutput] Send failed: Bot token invalid`);
console.error(`[Stream] Create failed: User quota exceeded`);
```

### Logging

```javascript
// Info: status changes, successful operations
console.log(`[NewsEngine] Fetched 15 articles from 5 sources`);
console.log(`[Stream] Run completed: 42 articles sent`);

// Warn: recoverable issues
console.warn(`[RSSSource] Feed fetch failed, retrying...`);
console.warn(`[Cache] TTL expiration, refetching...`);

// Error: failures that require attention
console.error(`[Stream] Run failed: AI timeout after 3 retries`);
console.error(`[Auth] Webhook signature verification failed`);
```

## API Design

### Request/Response Format

**Success response:**
```javascript
// GET /api/streams
{
  status: 200,
  data: [
    { id: "stream-1", name: "Tech Digest", config: {...} },
    ...
  ],
  pagination: { limit: 20, offset: 0, total: 42 }
}

// POST /api/streams
{
  status: 201,
  data: { id: "stream-new", name: "My Stream", config: {...} }
}
```

**Error response:**
```javascript
{
  status: 400,
  error: "Validation failed",
  details: {
    name: "Name must be at least 3 characters",
    config: "Invalid sources configuration"
  }
}

// OR

{
  status: 500,
  error: "Internal server error"
}
```

### Hono Route Handlers

```javascript
// src/api/routes/streams.js
import { Hono } from 'hono';
import { listStreams, createStream } from '../services/stream-service.js';

export const streams = new Hono();

// GET /api/streams
streams.get('/', async (c) => {
  try {
    const userId = c.get('userId');
    const { limit = 20, offset = 0 } = c.req.query();
    
    const streams = await listStreams(c.env.DB, userId, { limit, offset });
    return c.json({ data: streams }, 200);
  } catch (err) {
    console.error(`[Streams] List failed: ${err.message}`);
    return c.json({ error: 'Failed to list streams' }, 500);
  }
});

// POST /api/streams
streams.post('/', async (c) => {
  try {
    const userId = c.get('userId');
    const body = await c.req.json();
    
    // Validate
    if (!body.name?.trim()) {
      return c.json({ error: 'Name required' }, 400);
    }
    
    const stream = await createStream(c.env.DB, userId, body);
    return c.json({ data: stream }, 201);
  } catch (err) {
    console.error(`[Streams] Create failed: ${err.message}`);
    return c.json({ error: err.message }, 500);
  }
});
```

### Validation

**Schema validation (simple approach):**
```javascript
// src/api/validators/stream-config.js
export function validateStreamConfig(config) {
  const errors = {};

  if (!config.sources || !Array.isArray(config.sources) || config.sources.length === 0) {
    errors.sources = 'At least 1 source required';
  }

  if (!config.ai || !config.ai.provider) {
    errors.ai = 'AI provider required';
  }

  if (!config.outputs || !Array.isArray(config.outputs) || config.outputs.length === 0) {
    errors.outputs = 'At least 1 output required';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

// Usage
const { isValid, errors } = validateStreamConfig(body.config);
if (!isValid) {
  return c.json({ error: 'Validation failed', details: errors }, 400);
}
```

## Database

### D1 Queries

**Always use parameterized queries (prevent SQL injection):**
```javascript
// ✅ Correct: parameterized
await db.prepare('SELECT * FROM streams WHERE id=? AND user_id=?')
  .bind(streamId, userId).first();

// ❌ Wrong: string concatenation
await db.prepare(`SELECT * FROM streams WHERE id='${streamId}' AND user_id='${userId}'`)
  .first();
```

**Always scope queries to `user_id` (tenant isolation):**
```javascript
// ✅ Correct: user_id enforced
await db.prepare('SELECT * FROM streams WHERE id=? AND user_id=?')
  .bind(streamId, userId).first();

// ❌ Wrong: no user_id check
await db.prepare('SELECT * FROM streams WHERE id=?')
  .bind(streamId).first();
```

**Batch operations:**
```javascript
// Multiple inserts
const inserts = articles.map(a =>
  db.prepare('INSERT INTO articles (id, title, url, ...) VALUES (?, ?, ?, ...)')
    .bind(a.id, a.title, a.url, ...)
);
await Promise.all(inserts.map(q => q.run()));
```

**Index usage for common queries:**
```sql
-- Query: SELECT * FROM streams WHERE user_id=? ORDER BY created_at DESC
CREATE INDEX idx_streams_user_created ON streams(user_id, created_at DESC);

-- Query: SELECT * FROM streams WHERE active=1 AND next_run_at <= NOW()
CREATE INDEX idx_streams_active_next_run ON streams(active, next_run_at) WHERE active=1;
```

## Middleware

### Middleware Order

```javascript
// src/api/app.js
app.use('/api/*', cors());              // 1. CORS first
app.use('/api/auth/*', rateLimitByIP(60)); // 2. Rate limit
app.all('/api/auth/*', (c) => auth.handler(c.req.raw)); // 3. Auth handler

const api = new Hono();
api.use('*', requireAuth());            // 4. Require auth
api.use('*', rateLimitByUser(120));     // 5. Rate limit by user
// ... routes
app.route('/api', api);
```

### Custom Middleware

```javascript
// src/api/middleware/custom.js
export function customMiddleware() {
  return async (c, next) => {
    // Before handler
    c.set('startTime', Date.now());
    
    await next();
    
    // After handler
    const duration = Date.now() - c.get('startTime');
    c.header('X-Response-Time', `${duration}ms`);
  };
}

// Usage
app.use('*', customMiddleware());
```

## Testing Strategy

### Unit Tests

**Target:** Core business logic (engine, plugins, services)

```javascript
// test/engine.test.js
import { describe, it, expect } from '@jest/globals';
import { NewsEngine } from '../src/core/engine.js';

describe('NewsEngine', () => {
  it('should fetch from multiple sources', async () => {
    const engine = new NewsEngine();
    engine.addSource(mockSource1, mockSource2);
    
    const articles = await engine._fetchAll();
    expect(articles.length).toBe(10); // 5 from each source
  });

  it('should skip duplicate articles', async () => {
    const articles = [
      { id: 'a1', title: 'Article 1' },
      { id: 'a1', title: 'Article 1' }, // Duplicate
    ];
    
    const deduped = engine._dedup(articles);
    expect(deduped.length).toBe(1);
  });
});
```

### Integration Tests

**Target:** API routes with database (mock CF Workers)

```javascript
// test/api-streams.test.js
describe('POST /api/streams', () => {
  it('should create stream for authenticated user', async () => {
    const res = await app.request(
      new Request('http://localhost/api/streams', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Cookie': 'session=...' // Mock session
        },
        body: JSON.stringify({
          name: 'Tech Digest',
          config: { sources: [...], ai: {...}, outputs: [...] }
        })
      })
    );
    
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.data.id).toBeTruthy();
  });
});
```

### Current Status

- [x] Manual testing (running in production)
- [ ] Unit test suite
- [ ] Integration test suite
- [ ] Load test (1k concurrent)

## Type Annotations (JSDoc)

**Use JSDoc for clarity, especially on public APIs:**

```javascript
/**
 * Fetch articles from source
 * @param {Object} options
 * @param {number} [options.limit=10] - Max articles to fetch
 * @param {Date} [options.since] - Only articles after this date
 * @returns {Promise<Article[]>} Array of articles
 * @throws {Error} If fetch fails after retries
 */
async fetch(options = {}) {
  const { limit = 10, since } = options;
  // ...
}

/**
 * @typedef {Object} Article
 * @property {string} id - Unique article ID
 * @property {string} title - Article headline
 * @property {string} url - Article URL
 * @property {string} content - Article body (plain text)
 * @property {string} source - Source plugin name
 * @property {string} [category] - Optional category
 * @property {Date} [publishedAt] - Publish date
 */
```

## Configuration Management

### Environment Variables

**Naming:** `SCREAMING_SNAKE_CASE`

```javascript
// ✅ Correct
const apiKey = process.env.ANTHROPIC_API_KEY;
const dbPath = process.env.CACHE_PATH || '.cache/news.json';

// ❌ Incorrect
const apiKey = process.env.anthropic_api_key;
const dbPath = process.env.CachePath;
```

**Loading in CF Workers:**
```javascript
// Bindings injected by Cloudflare
export default {
  async fetch(request, env, ctx) {
    // env.ANTHROPIC_API_KEY is available
    // env.DB is D1 binding
    // env.STREAM_QUEUE is Queue binding
  }
}
```

**Loading in Node.js:**
```javascript
// Load .env via dotenv (optional)
import 'dotenv/config.js';

// Access
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  throw new Error('ANTHROPIC_API_KEY not set');
}
```

## Git & Commits

### Commit Message Format

**Conventional commits:**
```
feat(streams): add stream template system
fix(auth): prevent session fixation attacks
docs(api): update authentication guide
refactor(engine): simplify deduplication logic
test(sources): add RSS parser tests
chore(deps): upgrade hono to 4.12.14
```

**Format:** `type(scope): message`

| Type | Meaning |
|------|---------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `refactor` | Code refactoring (no behavior change) |
| `test` | Tests only |
| `chore` | Dependencies, build config |

### Branch Naming

```
feature/stream-templates       # New feature
fix/session-fixation-attack    # Bug fix
docs/api-endpoints             # Docs update
refactor/engine-dedup          # Refactoring
```

### Pre-Commit Checks

Before committing, ensure:
1. ✅ Code runs (no syntax errors)
2. ✅ Tests pass (if applicable)
3. ✅ Linting passes (ESLint)
4. ✅ No secrets in commit (.env, API keys)
5. ✅ Commit message follows convention

## Performance Guidelines

### Concurrency Limits

```javascript
// Don't fetch all sources in parallel (DoS sources)
const CONCURRENCY_LIMIT = 5; // Max 5 parallel requests
const BATCH_DELAY_MS = 500;  // 500ms between batches

async function fetchAllSources(sources) {
  const batches = chunk(sources, CONCURRENCY_LIMIT);
  const articles = [];
  
  for (const batch of batches) {
    const results = await Promise.allSettled(
      batch.map(s => s.fetch())
    );
    articles.push(...results
      .filter(r => r.status === 'fulfilled')
      .map(r => r.value)
      .flat());
    
    await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
  }
  
  return articles;
}
```

### CF Workers Limits

- **Execution time:** 30 seconds (HTTP), 30 seconds (background)
- **Memory:** 128 MB
- **Concurrent connections:** 600
- **Request body:** 100 MB

**For long-running operations:** Use CF Queue or Durable Objects

### Database Query Optimization

```javascript
// ❌ Slow: N+1 query
const streams = await db.prepare('SELECT * FROM streams WHERE user_id=?')
  .bind(userId).all();
for (const stream of streams.results) {
  const lastRun = await db.prepare('SELECT * FROM run_history WHERE stream_id=? ORDER BY ran_at DESC LIMIT 1')
    .bind(stream.id).first();
  stream.lastRun = lastRun;
}

// ✅ Fast: JOIN
const streams = await db.prepare(`
  SELECT s.*, rh.id as lastRunId, rh.ran_at as lastRunAt
  FROM streams s
  LEFT JOIN run_history rh ON s.id = rh.stream_id
  WHERE s.user_id = ?
  AND (rh.id IS NULL OR rh.ran_at = (
    SELECT MAX(ran_at) FROM run_history WHERE stream_id = s.id
  ))
`).bind(userId).all();
```

## Security

### Secrets Handling

```javascript
// ✅ Correct: use env variables
const botToken = process.env.TELEGRAM_BOT_TOKEN;

// ✅ Correct: mask in logs/API
const masked = '***' + botToken.slice(-4);
console.log(`Bot token: ${masked}`);

// ❌ Wrong: hardcode secrets
const botToken = 'tg_botxxxxx';

// ❌ Wrong: log full token
console.log(`Bot token: ${botToken}`);
```

### SQL Injection Prevention

```javascript
// ✅ Correct: parameterized
db.prepare('SELECT * FROM users WHERE email=?').bind(email).first();

// ❌ Wrong: string interpolation
db.prepare(`SELECT * FROM users WHERE email='${email}'`).first();
```

### CORS Configuration

```javascript
// ✅ Correct: specific origin
app.use(cors({
  origin: 'https://dashboard.newsengine.app',
  credentials: true,
}));

// ⚠️ Only for development
app.use(cors({ origin: '*' })); // Never in production
```

### Authentication Checks

```javascript
// ✅ Correct: enforce auth on protected routes
const api = new Hono();
api.use('*', requireAuth());
api.get('/streams', handler); // User required

// ❌ Wrong: forget to add middleware
app.get('/api/streams', handler); // No auth!
```

## Documentation

### Code Comments

**Avoid obvious comments:**
```javascript
// ❌ Obvious
let count = 0; // Initialize count to 0
count++; // Increment count

// ✅ Meaningful
let retryCount = 0;
retryCount++; // Exponential backoff: 1s, 2s, 4s...
```

**Document non-obvious logic:**
```javascript
// ✅ Explain why
// We use bigram similarity (not full-text) to speed up dedup
// on large article sets (1000+ articles)
function isSimilar(a, b) {
  const bigramsA = extractBigrams(a.title);
  const bigramsB = extractBigrams(b.title);
  return similarity(bigramsA, bigramsB) > 0.7;
}
```

### Function Documentation

**Export API functions with JSDoc:**
```javascript
/**
 * Summarize articles using configured AI provider
 * @param {Article[]} articles - Articles to summarize
 * @param {Object} options
 * @param {string} [options.language='en'] - Summary language (vi, en)
 * @param {string} [options.style='digest'] - Style (digest, bullet, thread)
 * @param {number} [options.maxTokens=4096] - Max output tokens
 * @returns {Promise<{text: string, usage?: Object, model?: string}>}
 * @throws {Error} If AI provider fails
 */
export async function summarize(articles, options = {}) {
  // ...
}
```

### README Updates

When adding new features, update `docs/` files:
- `docs/codebase-summary.md` — Add to directory structure
- `docs/system-architecture.md` — Add to data flow if relevant
- `docs/project-roadmap.md` — Update milestone or next phase

## Linting & Formatting

### ESLint Config (Recommended)

```javascript
// .eslintrc.js
export default {
  env: { es2021: true, node: true },
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  rules: {
    'no-console': 'off', // Logging is OK
    'no-unused-vars': 'warn',
    'eqeqeq': ['error', 'always'], // === instead of ==
    'prefer-const': 'warn',
  },
};
```

### No Strict Formatting

- Prefer readability over strict style rules
- Use consistent indentation (2 spaces)
- Single quotes for strings (consistent)
- Semicolons optional (but use them for clarity)

## Summary

**Key Principles:**
1. **DRY (Don't Repeat Yourself)** — Extract reusable logic
2. **KISS (Keep It Simple, Stupid)** — Prefer simple over clever
3. **YAGNI (You Aren't Gonna Need It)** — Don't add "just in case"
4. **Fail safe** — Sources fail silently, AI/outputs throw
5. **Tenant first** — Every query scoped to user_id
6. **No surprises** — Clear function names, JSDoc for complex logic
