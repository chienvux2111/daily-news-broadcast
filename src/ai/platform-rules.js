/**
 * Platform-specific formatting rules and hook templates
 * Injected into AI prompts based on target platform
 */

// ============================================
// Digest/style formatting rules (appended to STYLES system prompt)
// ============================================

export const PLATFORM_RULES = {
  telegram: `FORMAT RULES:
- Use Telegram formatting: *bold*, _italic_
- Do not use markdown headers like ##
- Maximum 4000 characters
- Keep the writing natural; do not force every item into the same template
- Do not add any signature, footer, channel name, or branding line`,

  x: `FORMAT RULES:
- Plain text only — no markdown, no HTML, no *bold* or _italic_
- Each tweet max 280 characters
- Thread format: number as 1/n, 2/n... separated by blank lines
- Add 2-3 relevant hashtags to the first tweet only
- Punchy, direct tone, but avoid generic hype
- Max 10 tweets per thread`,

  threads: `FORMAT RULES:
- Plain text only — no markdown, no HTML
- Max 500 characters total
- Casual, conversational tone
- Emoji OK but max 3
- No hashtags required
- Sound like a useful share, not a press blurb`,

  facebook: `FORMAT RULES:
- Plain text only — no markdown, no HTML
- Optimal length: under 500 characters for engagement
- Friendly, slightly more formal than X
- End with a real question only when it fits the article
- Put link on its own line at the end`,
};

// ============================================
// Hook rules (drip mode single-article posts per platform)
// ============================================

export const HOOK_RULES = {
  telegram: {
    format: `RULES:
- Natural English for a Telegram crypto audience
- Exactly one short paragraph, with a light viewpoint only when supported by the source
- Around 300-500 characters
- Put the original link at the end as a plain URL
- No signature, no footer, no channel name, no branding line
- Emoji: optional, maximum 2, never spammy
- Use *bold* for one important keyword at most
- Do not start with an emoji
- Do not use markdown headers like ##`,
    examples: `EXAMPLE TONE (learn the style, do not copy):

---
Circle's move matters less as a headline and more as a signal that crypto treasury strategy is becoming a mainstream corporate tool. The real question is whether this reflects durable balance-sheet demand or short-term narrative trading.

https://www.coindesk.com/
---`,
  },

  x: {
    format: `RULES:
- Plain text only — NO markdown, NO *bold*, NO _italic_
- Max 280 characters total (including URL)
- Natural English tone
- Include article URL
- End with 2-3 relevant hashtags
- Punchy, one key insight only
- No signature, no footer, no branding line
- Avoid performative controversy or one-sided framing unless the article strongly supports it`,
    examples: `EXAMPLE TONE (learn style, DON'T copy):

---
Bitcoin ETF flows are still shaping short-term sentiment, but the bigger story is how liquidity is rotating across majors instead of broad risk-on behavior. https://www.coindesk.com/ #bitcoin #crypto
---`,
  },

  threads: {
    format: `RULES:
- Plain text only — NO markdown, NO *bold*
- Max 500 characters
- Natural English, casual but clear
- Include article URL on its own line
- No signature, no footer, no branding line
- Emoji: 0-2, natural placement only
- Avoid sounding like a launch announcement`,
    examples: `EXAMPLE TONE (learn style, DON'T copy):

---
This post is notable because it ties crypto adoption to a real capital markets event, not just social buzz. What matters now is whether the listing changes liquidity, access, or institutional confidence in the sector.

https://www.coindesk.com/
---`,
  },

  facebook: {
    format: `RULES:
- Plain text only — NO markdown
- 300-500 characters optimal
- Natural English tone, slightly more formal than X
- Summarize the key insight with one concrete implication
- End with a question only if it is specific and useful
- Link on its own line
- No signature, no footer, no branding line`,
    examples: `EXAMPLE TONE (learn style, DON'T copy):

---
This development stands out because it connects crypto momentum with a real financing and market access story. The key question is whether it reflects lasting institutional interest or a short-lived narrative boost.

https://www.coindesk.com/
---`,
  },
};
