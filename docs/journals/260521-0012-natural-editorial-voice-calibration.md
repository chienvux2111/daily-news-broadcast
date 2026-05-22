# Natural Editorial Voice Calibration

**Date**: 2026-05-21 00:12
**Severity**: Medium
**Component**: AI prompt generation
**Status**: Resolved

## What Happened

We tightened the Vietnamese editorial voice in `src/ai/_prompts.js` and `src/ai/platform-rules.js` so digest, hot-take, newsletter, weekly, and hook output reads more like a human tech editor and less like a template. The change stayed inside the existing prompt pipeline: `buildPrompt()` now carries a shared source-data guardrail, `buildHookPrompt()` reuses the same voice block, and `docs/system-architecture.md` now documents the prompt pair and the trust boundary.

## The Brutal Truth

The output had drifted into stiff, mechanical Vietnglish. We were asking formatting rules to do voice work, and that is exactly how you end up with text that looks organized but sounds dead. The annoying part is that the fix was not a new model or a new abstraction. It was prompt discipline we should have written earlier.

## Technical Details

`VIETNAMESE_VOICE` now centralizes the editorial tone, and `SOURCE_DATA_RULES` tells the model to treat article title/content/URL/metadata as untrusted input instead of instructions. `PLATFORM_RULES` and `HOOK_RULES` were tightened to remove template-heavy openers, fake contrarian cues, and press-release phrasing, while keeping Telegram/X/Threads/Facebook limits intact.

## What We Tried

We kept the existing prompt system instead of adding a second renderer or a separate voice engine. That was the right call: the problem was not orchestration, it was the text being fed into the orchestrator. Rewriting the prompt contract was smaller, safer, and easier to validate.

## Root Cause Analysis

The system let rigid format language dominate the editorial voice, and it did not explicitly separate source facts from prompt instructions. That made the model too eager to mirror source text and too eager to sound like a checklist.

## Lessons Learned

If the writing sounds templated, fix the prompt contract first. Keep style guidance centralized, keep platform rules narrow, and treat source content as hostile by default. Structure is useful, but structure without voice just produces better-looking sludge.

## Next Steps

Validation in the cook session passed with `node --check`, ESM import checks, `git diff --check`, and local Telegram/X prompt samples. Real provider preview was skipped because provider credentials were not configured in this workspace. If we want end-to-end confidence, someone needs to add credentials and run a live provider preview in the next pass.
