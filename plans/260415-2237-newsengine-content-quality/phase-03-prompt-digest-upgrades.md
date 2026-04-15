---
phase: 3
priority: high
status: pending
effort: M
blockedBy: [phase-02]
---

# Phase 3: Prompt & Digest Upgrades

## Overview
Upgrade the prompt system for editorial voice and better content. Add multi-format digest options (weekly recap, must-read picks, multi-language).

## Items
1. Prompt system upgrade (editorial voice, audience context, engagement hooks)
2. Multi-format digest improvements

---

## 1. Prompt System Upgrade

### Problems
- Content truncated at 300 chars — AI lacks context for good summaries
- Prompt is generic "summarize" — no editorial voice, no analysis
- No audience context — AI doesn't know target readers
- No engagement hooks — digest ends abruptly, no discussion prompt

### Solution
Rewrite `STYLES` in `_prompts.js` with richer prompts. Increase content limit. Add audience/persona config.

### Files to Modify
- **Modify:** `src/ai/_prompts.js` — rewrite prompts, increase content limit, add audience support

### Changes

**1. Increase content limit: 300 → 1000 chars**
```js
// In buildPrompt(), change:
${a.content ? `Content: ${a.content.substring(0, 1000)}` : ''}
```

**2. Add audience config to buildPrompt signature**
```js
export function buildPrompt(articles, options = {}) {
  const { language = 'vi', style = 'digest', audience = 'senior developers' } = options;
  // ...
}
```

**3. Rewrite digest prompt (Vietnamese)**
```
Bạn là tech news curator & editorial analyst cho cộng đồng ${audience} Việt Nam.

NHIỆM VỤ:
- Tạo bản tin kỹ thuật hàng ngày với PHÂN TÍCH chứ không chỉ tóm tắt
- Giải thích TẠI SAO mỗi bài quan trọng, IMPACT với developers
- Giữ thuật ngữ kỹ thuật tiếng Anh, giải thích bằng tiếng Việt

FORMAT:
- Bắt đầu: "🔥 DAILY TECH DIGEST - [DD/MM/YYYY]"
- Nhóm theo category (nếu articles có category khác nhau)
- Mỗi bài: emoji + nguồn in đậm, tiêu đề, 2-3 câu PHÂN TÍCH (không chỉ tóm tắt), link
- Nếu bài có nhiều nguồn (alsoFrom), note "Cũng được report bởi: ..."
- "💡 KEY TAKEAWAY" — 2-3 insight quan trọng nhất
- "🤔 DISCUSSION" — 1 câu hỏi mở khuyến khích thảo luận
- Hashtags cuối
- Dùng Telegram formatting: *bold*, _italic_
- KHÔNG dùng ## markdown headers
- Tối đa 4000 ký tự
```

**4. Rewrite digest prompt (English)**
Same structure, English version.

**5. Add `alsoFrom` rendering in article list**
```js
${a.meta?.alsoFrom?.length ? `Also reported by: ${a.meta.alsoFrom.join(', ')}` : ''}
```

**6. Add `meta.score` context for AI prioritization**
```js
${a.meta?.score ? `Relevance: ${a.meta.score}/100` : ''}
```

### Engine Config
Expose `audience` in engine options:
```js
engine.configure({ audience: 'Vietnamese senior developers' });
```

Pass through to `ai.summarize()` options → `buildPrompt()`.

---

## 2. Multi-Format Digest Improvements

### 2a. Weekly Recap Style

Add `weekly` style to STYLES:

```js
weekly: {
  vi: `Viết bản tổng kết tuần cho cộng đồng ${audience}. 
Format: "📊 WEEKLY TECH RECAP - Tuần [N]"
- Top 3 "Must Read" — phân tích sâu 4-5 câu mỗi bài, tại sao quan trọng
- "Trending Topics" — các chủ đề xuất hiện nhiều lần trong tuần
- "Quick Hits" — các tin ngắn khác, 1 dòng mỗi tin
- "🔮 NEXT WEEK" — dự đoán/theo dõi
Tối đa 6000 ký tự.`,
  en: `...English version...`,
}
```

### 2b. Must-Read Top 3

Add `mustread` style:

```js
mustread: {
  vi: `Chọn 3 bài QUAN TRỌNG NHẤT từ danh sách. Phân tích sâu mỗi bài (5-6 câu):
- Tại sao bài này quan trọng
- Impact với developers
- Key technical details
- Action items cho readers
Format: "⭐ MUST READ - [DD/MM/YYYY]"`,
  en: `...English version...`,
}
```

### 2c. Multi-Language Support

**Approach:** Engine runs AI summarize twice (or once with bilingual instruction).

Add to engine options:
```js
engine.configure({ language: 'vi', secondaryLanguage: 'en' });
```

In `engine.run()`, after AI summarize:
```js
if (this.options.secondaryLanguage && this.options.secondaryLanguage !== this.options.language) {
  const secondResult = await this.ai.summarize(articles, {
    ...this.options,
    language: this.options.secondaryLanguage,
  });
  // Store both versions
  content = { primary: result.text, secondary: secondResult.text };
}
```

**Output handling:** Each output plugin receives primary language. If output has `supportsBilingual: true`, receives both.

### Files to Modify
- **Modify:** `src/ai/_prompts.js` — new styles + rewritten prompts
- **Modify:** `src/core/engine.js` — `audience` in options, `secondaryLanguage` support in `run()`

---

## Success Criteria
- [ ] Digest prompt produces editorial analysis, not just summaries
- [ ] AI knows target audience and adjusts tone
- [ ] Each digest ends with a discussion question
- [ ] `weekly` and `mustread` styles work
- [ ] Multi-language produces EN + VI versions when configured
- [ ] Content limit increased to 1000 chars in prompt

## Todo
- [ ] Rewrite `STYLES.digest` prompts (vi + en) with editorial voice
- [ ] Add `weekly` and `mustread` styles to STYLES
- [ ] Update `buildPrompt()` — audience param, grouped formatting, alsoFrom, score context
- [ ] Increase content substring from 300 to 1000
- [ ] Add `audience` to engine configure options, pass through to AI
- [ ] Add `secondaryLanguage` support in engine.run()
- [ ] Test: preview digest with new prompts, verify editorial tone
