# Code Standards

## Language & Runtime

- **ES Modules only** — all files use `import/export`, `"type": "module"` in package.json
- **No TypeScript** — plain JS with JSDoc annotations for types
- **No build step** — runs directly via Node 18+ or Cloudflare Workers
- **Node >= 18** — relies on native `fetch()`, no polyfills

## Naming Conventions

| Element | Convention | Example |
|---------|-----------|---------|
| Files | kebab-case | `openai-compat.js`, `token-store.js` |
| Classes | PascalCase | `NewsEngine`, `RSSSource`, `XOutput` |
| Factory functions | camelCase | `createAI()`, `groq()`, `ollama()` |
| Constants | UPPER_SNAKE_CASE | `MAX_TWEET`, `GRAPH_API` |
| Private fields | `_` prefix | `this._config`, `this._cache` |
| Internal modules | `_` prefix file | `_prompts.js` |

## Plugin Pattern

All plugins extend one of 4 base classes from `core/contracts.js`:

```javascript
class MySource extends SourcePlugin {
  constructor(config) {
    super();
    this._config = config;  // Config injection via constructor
  }
  get id() { return 'my-source'; }   // Required: unique identifier
  get name() { return 'My Source'; }  // Required: display name
  async fetch(options) { ... }        // Required: return Article[]
}
```

Rules:
- Engine type-checks plugins at registration (`instanceof`)
- `core/` has **zero imports** from plugin directories — wiring happens in adapters/channels
- Plugins receive config in constructor, store as `this._config`

## Error Handling

| Layer | Strategy |
|-------|----------|
| Source `fetch()` | try/catch, return `[]` on failure (never throw) |
| AI `summarize()` | Throw on failure (engine catches, uses fallback format) |
| Output `send()` | Throw on failure (engine catches, logs error) |
| Engine pipeline | `Promise.allSettled` for parallel operations |

## Concurrency

- Source fetches batched by `options.concurrency` (default: 5)
- `Promise.allSettled` for parallel fetch (no single failure blocks others)
- 500ms delay between fetch batches
- Channels run sequentially (avoid API rate limits)

## File Size

- Keep individual files under 200 lines
- Split large files into focused modules
- Extract utilities into `src/utils/`

## Dependencies

- **Zero deps for core** — engine, parsers, AI clients, outputs use only native `fetch()`
- RSS/HTML parsing uses regex (no cheerio/xml2js) for Cloudflare Worker compatibility
- External deps only for runtime adapters: `node-cron`, `express`, `dotenv`, `redis`

## Config Pattern

Environment variables loaded at adapter level, passed down as config objects:
```
Adapter → reads env → Channel definitions → Plugin constructors
```

For `streams.config.json`, `$ENV_VAR` syntax references are resolved at load time by `config-loader.js`.

## Commit Messages

Conventional commits format:
```
feat(sources): add GitHub trending source plugin
fix(drip): prevent article loss on worker timeout
docs: update architecture documentation
```
