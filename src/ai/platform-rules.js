/**
 * Platform-specific formatting rules and hook templates
 * Injected into AI prompts based on target platform
 */

// ============================================
// Digest/style formatting rules (appended to STYLES system prompt)
// ============================================

export const PLATFORM_RULES = {
  telegram: `FORMAT RULES:
- Dùng Telegram formatting: *bold*, _italic_
- KHÔNG dùng ## markdown headers
- Tối đa 4000 ký tự`,

  x: `FORMAT RULES:
- Plain text only — no markdown, no HTML, no *bold* or _italic_
- Each tweet max 280 characters
- Thread format: number as 1/n, 2/n... separated by blank lines
- Add 2-3 relevant hashtags to the first tweet only
- Punchy, direct tone — no fluff
- Max 10 tweets per thread`,

  threads: `FORMAT RULES:
- Plain text only — no markdown, no HTML
- Max 500 characters total
- Casual, conversational tone
- Emoji OK but max 3
- No hashtags required`,

  facebook: `FORMAT RULES:
- Plain text only — no markdown, no HTML
- Optimal length: under 500 characters for engagement
- Friendly, slightly more formal than X
- End with a question to encourage comments
- Put link on its own line at the end`,
};

// ============================================
// Hook rules (drip mode single-article posts per platform)
// ============================================

export const HOOK_RULES = {
  telegram: {
    format: `QUY TẮC:
- Vietnglish tự nhiên, xen tiếng Anh như dev Việt chat hàng ngày
- CHỈ 1 đoạn tóm tắt, KHÔNG bình luận/đánh giá/opinion
- Tổng khoảng 300-500 ký tự
- Link gốc ở cuối, paste thẳng URL
- Dòng cuối cùng luôn là "— Dan Tech Daily News"
- Emoji: tối đa 3 cái hoặc không, đừng spam
- Dùng *bold* cho keyword quan trọng, 1-2 chỗ thôi
- KHÔNG bắt đầu bằng emoji, KHÔNG dùng ## headers`,
    examples: `VÍ DỤ TONE ĐÚNG (học cách viết, KHÔNG copy):

---
Cloudflare vừa announce *Agent Lee* — basically 1 cái interface mới cho phép build AI agents chạy trực tiếp trên Cloudflare stack. Tích hợp Workers, KV, D1, R2 hết. Thay vì phải tự wire mọi thứ thì giờ có sẵn framework cho agentic workflows, chạy on edge nên latency thấp, cost rẻ.

https://blog.cloudflare.com/introducing-agent-lee/
— Dan Tech Daily News
---`,
  },

  x: {
    format: `RULES:
- Plain text only — NO markdown, NO *bold*, NO _italic_
- Max 280 characters total (including URL)
- Vietnglish natural tone, mix English tech terms
- Include article URL
- End with 2-3 relevant hashtags
- Punchy, one key insight only
- End with "— Dan Tech Daily News"`,
    examples: `EXAMPLE TONE (learn style, DON'T copy):

---
Cloudflare just dropped Agent Lee — build AI agents directly on CF Workers stack. KV, D1, R2 integrated. Edge-native, low latency. blog.cloudflare.com/agent-lee/ — Dan Tech Daily News #cloudflare #ai
---`,
  },

  threads: {
    format: `RULES:
- Plain text only — NO markdown, NO *bold*
- Max 500 characters
- Vietnglish casual, like chatting with dev friends
- Include article URL on its own line
- End with "— Dan Tech Daily News"
- Emoji: 0-2, natural placement only`,
    examples: `EXAMPLE TONE (learn style, DON'T copy):

---
Cloudflare vừa ra Agent Lee — framework build AI agents chạy thẳng trên Workers stack. Tích hợp KV, D1, R2 luôn. Edge-native nên latency thấp, cost rẻ hơn cloud functions nhiều.

blog.cloudflare.com/agent-lee/
— Dan Tech Daily News
---`,
  },

  facebook: {
    format: `RULES:
- Plain text only — NO markdown
- 300-500 characters optimal
- Vietnglish friendly tone, slightly more formal than X
- Summarize the key insight, explain why it matters
- End with a question to encourage comments
- Link on its own line
- End with "— Dan Tech Daily News"`,
    examples: `EXAMPLE TONE (learn style, DON'T copy):

---
Cloudflare vừa ra mắt Agent Lee — framework mới cho phép build AI agents chạy trực tiếp trên edge. Tích hợp sẵn Workers, KV, D1. Đây có thể là bước ngoặt cho ai đang build agentic workflows.

Bạn đang dùng gì để deploy AI agents?

blog.cloudflare.com/agent-lee/
— Dan Tech Daily News
---`,
  },
};
