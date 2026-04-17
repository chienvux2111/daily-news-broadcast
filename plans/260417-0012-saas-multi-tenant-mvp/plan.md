---
title: "NewsEngine SaaS MVP"
description: "Multi-tenant SaaS with auth, billing, stream builder for solo creators"
status: in_progress
priority: P1
effort: 4w
branch: feature-build-saas
tags: [saas, auth, billing, multi-tenant, cloudflare]
created: 2026-04-17
---

# NewsEngine SaaS MVP

## Goal
Transform NewsEngine from single-operator tool into self-serve multi-tenant SaaS on Cloudflare stack.

## Architecture
```
CF Pages (SPA) --> CF Worker (Hono API) --> D1 (data) + KV (cache) + Queues (jobs)
                       |
              Better Auth (sessions)
              Polar.sh (billing)
              NewsEngine core (unchanged)
```

## Phases

| # | Phase | Effort | Status | Dependencies |
|---|-------|--------|--------|--------------|
| 01 | [Foundation: D1 + Hono](./phase-01-foundation-d1-hono.md) | 3d | Complete | None |
| 02 | [Auth Layer](./phase-02-auth-layer.md) | 2.5d | Complete | Phase 01 |
| 03 | [Multi-Tenant Streams](./phase-03-multi-tenant-streams.md) | 4d | Complete | Phase 02 |
| 04 | [Queue Execution](./phase-04-queue-execution.md) | 2d | Complete | Phase 01, 03 |
| 05 | [Billing Integration](./phase-05-billing-integration.md) | 3d | Complete | Phase 02 |
| 06 | [Landing + Onboarding](./phase-06-landing-onboarding.md) | 3d | Complete | Phase 03, 05 |
| 07 | [Polish + Launch](./phase-07-polish-launch.md) | 3d | Complete | All above |

## Constraints
- Engine core (`src/core/`, `src/sources/`, `src/ai/`, `src/outputs/`) MUST NOT be modified
- ES Modules only, no TypeScript, no build step
- Files under 200 lines each
- YAGNI/KISS/DRY

## Key Risks
| Risk | Impact | Mitigation |
|------|--------|------------|
| D1 batch() under concurrency | High | Queue consumer limits concurrency to 10 msgs/batch |
| Polar webhook blocked by Bot Fight | High | WAF bypass rule on webhook path |
| 30s CPU limit per queue invocation | Medium | Cap sources/stream, monitor execution time |
| Better Auth D1 migration drift | Low | Pin version, generate schema once, track in git |

## Validation Summary

**Validated:** 2026-04-17
**Questions asked:** 7

### Confirmed Decisions
- **Hono for API layer**: Approved. 12KB acceptable for API layer; core engine stays zero-dep.
- **Secrets in D1 plaintext**: Accepted for MVP. D1 encrypted at rest. Encrypt in V1.1.
- **OAuth channels deferred**: Confirmed. X/FB/Threads = V1.1 after paying customers validate demand.
- **Free tier AI — no fallback**: Accepted. Groq down = free tier paused. Incentivizes upgrade.
- **Preact CDN (no build step)**: Confirmed. Consistent with project philosophy. No React/Vite.
- **Product name**: NewsEngine (keep current name).
- **Timeline**: Full-time (8h/day), 4 weeks. No buffer — tight but feasible.

### Action Items
- [ ] No plan changes needed — all decisions align with existing phase files

## Research
- [Auth & Billing](./research/researcher-01-auth-billing.md)
- [Infra Architecture](./research/researcher-02-infra-architecture.md)
- [Brainstorm](../reports/brainstorm-260417-0012-saas-scaling-strategy.md)
