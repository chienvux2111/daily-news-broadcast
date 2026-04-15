---
status: completed
created: 2026-04-15
branch: master
blockedBy: []
blocks: []
---

# NewsEngine Content Quality & Engagement Improvements

## Goal
Transform NewsEngine from a basic news aggregator into an intelligent, engaging news curator that delivers high-quality, personalized digests to niche developer communities.

## Phases

| # | Phase | Status | Effort | Files |
|---|-------|--------|--------|-------|
| 1 | [Foundation & DRY Fixes](phase-01-foundation-dry-fixes.md) | completed | S | 4 files |
| 2 | [Content Intelligence](phase-02-content-intelligence.md) | completed | M | 3 new files + engine.js |
| 3 | [Prompt & Digest Upgrades](phase-03-prompt-digest-upgrades.md) | completed | M | 2 files |
| 4 | [GitHub Trending Source](phase-04-github-trending-source.md) | completed | S | 2 new files |

## Dependencies
- Phase 2 depends on Phase 1 (retry logic needed before scoring)
- Phase 3 depends on Phase 2 (category grouping feeds into prompt system)
- Phase 4 is independent, can run in parallel with any phase

## Architecture Impact
- No breaking changes to plugin contracts
- All new features are opt-in via middleware or config
- Existing adapters (node.js, cloudflare.js) get simpler after DRY extract

## Risk
- Semantic dedup: false positives on similar-but-different articles. Mitigation: conservative threshold (0.7+).
- Reddit rate limiting: 429 errors during high-concurrency fetches. Mitigation: exponential backoff.
- Prompt changes: AI output quality varies by model. Mitigation: test with multiple providers.
