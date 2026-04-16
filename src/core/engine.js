/**
 * ============================================
 * NewsEngine — Plugin-based orchestrator
 * ============================================
 * 
 * Usage:
 *   const engine = new NewsEngine()
 *     .addSource(new RSSSource({ url: '...' }))
 *     .addSource(new HackerNewsSource())
 *     .useAI(new ClaudeAI({ apiKey: '...' }))
 *     .addOutput(new TelegramOutput({ token: '...', chatId: '...' }))
 *     .addOutput(new SlackOutput({ webhook: '...' }))
 *     .useCache(new FileCache('./cache.json'));
 * 
 *   await engine.run();
 */

import { SourcePlugin, AIPlugin, OutputPlugin, CachePlugin } from './contracts.js';

export class NewsEngine {
  constructor() {
    /** @type {SourcePlugin[]} */
    this.sources = [];
    /** @type {AIPlugin|null} */
    this.ai = null;
    /** @type {OutputPlugin[]} */
    this.outputs = [];
    /** @type {CachePlugin} */
    this.cache = new NoopCache();
    /** @type {Function} */
    this.logger = console.log;
    /** @type {Function[]} */
    this.middlewares = [];
    /** @type {Object} */
    this.options = {
      concurrency: 5,
      maxArticlesPerSource: 5,
      maxRetries: 2,
      language: 'vi',
      secondaryLanguage: null, // set to 'en' for bilingual digest
      style: 'digest',
      audience: 'senior developers',
      since: new Date(Date.now() - 24 * 60 * 60 * 1000), // last 24h
    };
  }

  // ============================================
  // Builder API (fluent / chainable)
  // ============================================

  addSource(source) {
    if (!(source instanceof SourcePlugin)) {
      throw new Error(`Invalid source: must extend SourcePlugin`);
    }
    this.sources.push(source);
    return this;
  }

  useAI(ai) {
    if (!(ai instanceof AIPlugin)) {
      throw new Error(`Invalid AI: must extend AIPlugin`);
    }
    this.ai = ai;
    return this;
  }

  addOutput(output) {
    if (!(output instanceof OutputPlugin)) {
      throw new Error(`Invalid output: must extend OutputPlugin`);
    }
    this.outputs.push(output);
    return this;
  }

  useCache(cache) {
    if (!(cache instanceof CachePlugin)) {
      throw new Error(`Invalid cache: must extend CachePlugin`);
    }
    this.cache = cache;
    return this;
  }

  /**
   * Middleware: transform articles after fetch, before AI
   * @param {Function} fn - (articles: Article[]) => Article[]
   */
  use(fn) {
    this.middlewares.push(fn);
    return this;
  }

  setLogger(fn) {
    this.logger = fn;
    return this;
  }

  configure(options) {
    this.options = { ...this.options, ...options };
    return this;
  }

  // ============================================
  // Execution
  // ============================================

  /**
   * Run full pipeline: Fetch → Dedup → Middleware → AI → Send
   * @param {Object} [runOptions]
   * @param {boolean} [runOptions.force=false]   - Skip dedup
   * @param {boolean} [runOptions.dryRun=false]  - Don't send to outputs
   * @returns {Promise<RunResult>}
   */
  async run(runOptions = {}) {
    const { force = false, dryRun = false } = runOptions;
    const log = this.logger;
    const startTime = Date.now();

    this._validate();

    // Check already sent today
    if (!force) {
      const todayKey = `digest:${dateKey()}`;
      if (await this.cache.has(todayKey)) {
        log('[Engine] Digest already sent today. Use force=true to override.');
        return { status: 'skipped', reason: 'already_sent' };
      }
    }

    // === Step 1: FETCH ===
    log(`[Engine] Fetching from ${this.sources.length} source(s)...`);
    let articles = await this._fetchAll();
    log(`[Engine] Got ${articles.length} article(s)`);

    if (articles.length === 0) {
      return { status: 'skipped', reason: 'no_articles', stats: this._stats(0, 0) };
    }

    // === Step 2: DEDUP ===
    if (!force) {
      const before = articles.length;
      articles = await this._dedup(articles);
      log(`[Engine] ${articles.length} new (${before - articles.length} cached)`);
    }

    if (articles.length === 0) {
      return { status: 'skipped', reason: 'all_cached', stats: this._stats(0, 0) };
    }

    // === Step 3: MIDDLEWARE ===
    for (const mw of this.middlewares) {
      articles = await mw(articles);
    }

    // === Step 4: AI SUMMARIZE ===
    let content;
    let secondaryContent = null;
    let aiUsage = null;
    if (this.ai) {
      const aiOpts = {
        language: this.options.language,
        style: this.options.style,
        audience: this.options.audience,
      };
      log(`[Engine] Summarizing with ${this.ai.name}...`);
      const result = await this.ai.summarize(articles, aiOpts);
      content = result.text;
      aiUsage = result.usage || null;

      // Secondary language digest (bilingual support)
      const secLang = this.options.secondaryLanguage;
      if (secLang && secLang !== this.options.language) {
        log(`[Engine] Generating secondary digest (${secLang})...`);
        const secResult = await this.ai.summarize(articles, { ...aiOpts, language: secLang });
        secondaryContent = secResult.text;
        if (secResult.usage && aiUsage) {
          aiUsage.input = (aiUsage.input || 0) + (secResult.usage.input || 0);
          aiUsage.output = (aiUsage.output || 0) + (secResult.usage.output || 0);
        }
      }
    } else {
      content = this._fallbackFormat(articles);
    }

    // === Step 5: SEND TO OUTPUTS ===
    const outputResults = [];
    if (!dryRun) {
      log(`[Engine] Sending to ${this.outputs.length} output(s)...`);
      for (const output of this.outputs) {
        try {
          const formatted = this._fitToOutput(content, output);
          const result = await output.send(formatted, { articles });
          outputResults.push({ id: output.id, name: output.name, ...result });
          log(`[Engine] ✓ ${output.name}: ${result.success ? 'OK' : result.error}`);
        } catch (error) {
          outputResults.push({ id: output.id, name: output.name, success: false, error: error.message });
          log(`[Engine] ✗ ${output.name}: ${error.message}`);
        }
      }

      // Mark articles as sent
      await this._markSent(articles);
      await this.cache.set(`digest:${dateKey()}`, JSON.stringify({
        sentAt: new Date().toISOString(),
        articleCount: articles.length,
      }), 30 * 24 * 60 * 60 * 1000);
    }

    const durationMs = Date.now() - startTime;
    log(`[Engine] Done in ${durationMs}ms`);

    return {
      status: dryRun ? 'dry_run' : 'success',
      content,
      ...(secondaryContent && { secondaryContent }),
      stats: this._stats(articles.length, durationMs),
      aiUsage,
      outputs: outputResults,
    };
  }

  /**
   * Drip mode: queue-based distribution across multiple cron runs per day.
   *
   * First run of the day: fetch → score → store top N in cache queue "drip:queue:{date}"
   * Every run (including first): pop batchSize articles from queue → generate hook → send
   *
   * With 5 crons/day and batchSize=3: 15 articles spread across the day.
   *
   * @param {Object} [runOptions]
   * @param {boolean} [runOptions.force=false]      - Re-fetch even if queue exists
   * @param {boolean} [runOptions.dryRun=false]     - Don't send to outputs
   * @param {number}  [runOptions.batchSize=3]      - Articles per run
   * @param {number}  [runOptions.delayMs=5000]     - Delay between messages in same batch (ms)
   * @returns {Promise<DripResult>}
   */
  async runDrip(runOptions = {}) {
    const { force = false, dryRun = false, batchSize = 3, delayMs = 5000 } = runOptions;
    const log = this.logger;
    const startTime = Date.now();

    this._validate();
    if (!this.ai) throw new Error('Drip mode requires an AI provider for hook generation');

    const queueKey = `drip:queue:${dateKey()}`;

    // Check if queue exists for today
    let queue = null;
    const cached = await this.cache.get(queueKey);
    if (cached && !force) {
      try { queue = JSON.parse(cached); } catch { queue = null; }
    }

    // First run of the day (or force): fetch + build queue
    if (!queue || queue.length === 0) {
      log(`[Engine] Fetching from ${this.sources.length} source(s)...`);
      let articles = await this._fetchAll();
      log(`[Engine] Got ${articles.length} article(s)`);
      if (articles.length === 0) return { status: 'skipped', reason: 'no_articles' };

      // Dedup against previously sent articles
      const before = articles.length;
      articles = await this._dedup(articles);
      log(`[Engine] ${articles.length} new (${before - articles.length} cached)`);
      if (articles.length === 0) return { status: 'skipped', reason: 'all_cached' };

      for (const mw of this.middlewares) {
        articles = await mw(articles);
      }

      // Store full queue for the day
      queue = articles.map(a => ({ ...a, publishedAt: a.publishedAt?.toISOString?.() || a.publishedAt }));
      await this.cache.set(queueKey, JSON.stringify(queue), 24 * 60 * 60 * 1000);
      log(`[Engine] Queue created: ${queue.length} articles for today`);
    } else {
      log(`[Engine] Queue loaded: ${queue.length} articles remaining`);
    }

    // Pop batch from front of queue
    const batch = queue.splice(0, batchSize);
    if (batch.length === 0) {
      log('[Engine] Queue empty, nothing to send');
      return { status: 'skipped', reason: 'queue_empty' };
    }

    // Save updated queue (remaining articles)
    await this.cache.set(queueKey, JSON.stringify(queue), 24 * 60 * 60 * 1000);

    // Generate hook + send each article
    const { buildHookPrompt } = await import('../ai/_prompts.js');
    const results = [];
    let totalUsage = { input: 0, output: 0 };

    log(`[Engine] Sending ${batch.length} articles (${queue.length} remaining in queue)...`);

    for (let i = 0; i < batch.length; i++) {
      const article = batch[i];
      try {
        const hookPrompt = buildHookPrompt(article, {
          language: this.options.language,
          audience: this.options.audience,
        });
        const aiResult = await this.ai.summarize([article], {
          language: this.options.language,
          audience: this.options.audience,
          systemPrompt: hookPrompt.system,
          _rawUserPrompt: hookPrompt.user,
        });

        const hookText = aiResult.text;
        if (aiResult.usage) {
          totalUsage.input += aiResult.usage.input || 0;
          totalUsage.output += aiResult.usage.output || 0;
        }

        if (!dryRun) {
          for (const output of this.outputs) {
            try {
              const formatted = this._fitToOutput(hookText, output);
              const sendResult = await output.send(formatted, { article });
              log(`[Engine] ✓ [${i + 1}/${batch.length}] ${output.name}: ${article.title.substring(0, 50)}...`);
              results.push({ article: article.title, output: output.id, ...sendResult });
            } catch (err) {
              log(`[Engine] ✗ [${i + 1}/${batch.length}] ${output.name}: ${err.message}`);
              results.push({ article: article.title, output: output.id, success: false, error: err.message });
            }
          }
          await this._markSent([article]);
        } else {
          log(`[Engine] [${i + 1}/${batch.length}] ${article.title.substring(0, 60)}`);
          log(hookText);
          log('---');
          results.push({ article: article.title, hook: hookText, dryRun: true });
        }

        if (i < batch.length - 1 && !dryRun) {
          await sleep(delayMs);
        }
      } catch (err) {
        log(`[Engine] ✗ [${i + 1}/${batch.length}] Hook failed: ${err.message}`);
        results.push({ article: article.title, success: false, error: err.message });
      }
    }

    const durationMs = Date.now() - startTime;
    log(`[Engine] Drip done in ${durationMs}ms — ${batch.length} sent, ${queue.length} remaining`);

    return {
      status: dryRun ? 'dry_run' : 'success',
      mode: 'drip',
      articles: results,
      stats: { ...this._stats(batch.length, durationMs), mode: 'drip', remaining: queue.length },
      aiUsage: totalUsage,
    };
  }

  /**
   * Fetch only — returns raw articles (useful for debugging)
   */
  async fetchAll() {
    this._validateSources();
    return this._fetchAll();
  }

  /**
   * Generate content only — no output sending
   */
  async generate() {
    return this.run({ dryRun: true });
  }

  // ============================================
  // Internal
  // ============================================

  _validate() {
    if (this.sources.length === 0) throw new Error('No sources registered. Use .addSource()');
    if (this.outputs.length === 0 && !this.ai) {
      throw new Error('No outputs and no AI registered. Use .addOutput() and/or .useAI()');
    }
  }

  _validateSources() {
    if (this.sources.length === 0) throw new Error('No sources registered.');
  }

  async _fetchAll() {
    const { concurrency, maxArticlesPerSource, since, maxRetries } = this.options;
    const allArticles = [];

    for (let i = 0; i < this.sources.length; i += concurrency) {
      const batch = this.sources.slice(i, i + concurrency);
      const results = await Promise.allSettled(
        batch.map(source => this._fetchWithRetry(source, { limit: maxArticlesPerSource, since }, maxRetries))
      );

      for (const result of results) {
        if (result.status === 'fulfilled') {
          allArticles.push(...result.value);
        }
      }

      if (i + concurrency < this.sources.length) {
        await sleep(500);
      }
    }

    return allArticles;
  }

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
          this.logger(`[Engine] ✗ ${source.name} failed after ${attempt + 1} attempts: ${err.message}`);
          return [];
        }
        const delay = 1000 * (attempt + 1);
        this.logger(`[Engine] ⟳ ${source.name} retry ${attempt + 1}/${maxRetries} in ${delay}ms`);
        await sleep(delay);
      }
    }
    return [];
  }

  async _dedup(articles) {
    const fresh = [];
    for (const article of articles) {
      const key = `seen:${hash(article.id)}`;
      if (!(await this.cache.has(key))) {
        fresh.push(article);
      }
    }
    return fresh;
  }

  async _markSent(articles) {
    for (const article of articles) {
      const key = `seen:${hash(article.id)}`;
      await this.cache.set(key, '1', 7 * 24 * 60 * 60 * 1000);
    }
  }

  _fitToOutput(content, output) {
    if (content.length <= output.maxLength) return content;
    // Smart truncate at paragraph boundary
    const truncated = content.substring(0, output.maxLength - 50);
    const lastBreak = truncated.lastIndexOf('\n\n');
    return (lastBreak > content.length * 0.5 ? truncated.substring(0, lastBreak) : truncated) + '\n\n[...]';
  }

  _fallbackFormat(articles) {
    return articles.map(a => `• ${a.title}\n  ${a.url}`).join('\n\n');
  }

  _stats(articleCount, durationMs) {
    return {
      sources: this.sources.length,
      articles: articleCount,
      outputs: this.outputs.length,
      ai: this.ai?.name || null,
      durationMs,
    };
  }
}

// ============================================
// Helpers
// ============================================

class NoopCache extends CachePlugin {}

function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h) + str.charCodeAt(i);
    h = h & h;
  }
  return Math.abs(h).toString(36);
}

function dateKey() {
  return new Date().toISOString().split('T')[0];
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
