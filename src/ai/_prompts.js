/**
 * Shared prompt builder for all AI plugins
 * Generates system + user prompt based on language, style, and audience
 * Supports both flat article lists and category-grouped articles
 */

import { groupByCategory } from '../core/grouping.js';

const STYLES = {
  digest: {
    vi: (audience) => `Bạn là tech news curator & editorial analyst cho cộng đồng ${audience} Việt Nam.

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
- Tối đa 4000 ký tự`,

    en: (audience) => `You are a tech news curator & editorial analyst for ${audience}.

TASK:
- Create a daily tech digest with ANALYSIS, not just summaries
- Explain WHY each article matters and its IMPACT on developers
- Keep technical terms in English

FORMAT:
- Start: "🔥 DAILY TECH DIGEST - [DD/MM/YYYY]"
- Group by category when articles span multiple categories
- Each article: emoji + bold source, title, 2-3 sentences of ANALYSIS (not just summary), link
- If article has multiple sources (alsoFrom), note "Also reported by: ..."
- "💡 KEY TAKEAWAY" — 2-3 most important insights
- "🤔 DISCUSSION" — 1 open question to encourage discussion
- Hashtags at end
- Use Telegram formatting: *bold*, _italic_
- NO markdown headers (##)
- Max 4000 characters`,
  },

  bullet: {
    vi: () => `Tóm tắt danh sách tin kỹ thuật thành bullet points ngắn gọn bằng tiếng Việt. Mỗi tin 1 dòng, giữ thuật ngữ tiếng Anh. Kèm link.`,
    en: () => `Summarize tech articles as concise bullet points. One line each with link.`,
  },

  thread: {
    vi: () => `Viết chuỗi bài đăng (thread) cho mạng xã hội từ danh sách tin kỹ thuật. Mỗi bài 280 ký tự. Tiếng Việt, giữ thuật ngữ tiếng Anh. Đánh số 1/n, 2/n...`,
    en: () => `Write a social media thread from tech articles. Each post max 280 chars. Number as 1/n, 2/n...`,
  },

  newsletter: {
    vi: (audience) => `Viết newsletter kỹ thuật tuần từ danh sách bài viết cho ${audience}. Tiếng Việt, giữ thuật ngữ tiếng Anh. Format: mở đầu thân mật → phân tích từng bài → kết luận insight.`,
    en: (audience) => `Write a weekly tech newsletter for ${audience}. Friendly intro → analysis per article → closing insight.`,
  },

  weekly: {
    vi: (audience) => `Viết bản tổng kết tuần cho cộng đồng ${audience}.
Format: "📊 WEEKLY TECH RECAP - Tuần [N]"
- Top 3 "Must Read" — phân tích sâu 4-5 câu mỗi bài, tại sao quan trọng
- "Trending Topics" — các chủ đề xuất hiện nhiều lần trong tuần
- "Quick Hits" — các tin ngắn khác, 1 dòng mỗi tin
- "🔮 NEXT WEEK" — dự đoán/theo dõi
- Dùng Telegram formatting: *bold*, _italic_
- KHÔNG dùng ## markdown headers
- Tối đa 6000 ký tự.`,
    en: (audience) => `Write a weekly tech recap for ${audience}.
Format: "📊 WEEKLY TECH RECAP - Week [N]"
- Top 3 "Must Read" — deep analysis 4-5 sentences each, why it matters
- "Trending Topics" — themes appearing multiple times this week
- "Quick Hits" — other news in 1 line each
- "🔮 NEXT WEEK" — predictions/watch items
- Use Telegram formatting: *bold*, _italic_
- NO markdown headers (##)
- Max 6000 characters.`,
  },

  mustread: {
    vi: (audience) => `Chọn 3 bài QUAN TRỌNG NHẤT từ danh sách cho ${audience}. Phân tích sâu mỗi bài (5-6 câu):
- Tại sao bài này quan trọng
- Impact với developers
- Key technical details
- Action items cho readers
Format: "⭐ MUST READ - [DD/MM/YYYY]"
- Dùng Telegram formatting: *bold*, _italic_
- KHÔNG dùng ## markdown headers
- Tối đa 4000 ký tự`,
    en: (audience) => `Pick the 3 MOST IMPORTANT articles for ${audience}. Deep analysis per article (5-6 sentences):
- Why this article matters
- Impact on developers
- Key technical details
- Action items for readers
Format: "⭐ MUST READ - [DD/MM/YYYY]"
- Use Telegram formatting: *bold*, _italic_
- NO markdown headers (##)
- Max 4000 characters`,
  },
};

/**
 * Format a single article for the prompt
 */
function formatArticle(a, index) {
  const meta = a.meta || {};
  const icon = meta.icon || '📰';
  const parts = [
    `${index}. [${icon} ${a.source}] "${a.title}"`,
    `   URL: ${a.url}`,
  ];
  if (a.content) parts.push(`   Content: ${a.content.substring(0, 1000)}`);
  if (a.category) parts.push(`   Category: ${a.category}`);
  if (meta.score) parts.push(`   Relevance: ${meta.score}/100`);
  if (meta.alsoFrom?.length) parts.push(`   Also reported by: ${meta.alsoFrom.join(', ')}`);
  return parts.join('\n');
}

/**
 * Format articles — auto-groups by category if articles have mixed categories
 */
function formatArticleList(articles) {
  const categories = new Set(articles.map(a => a.category).filter(Boolean));

  // Flat list if all same category or no categories
  if (categories.size <= 1) {
    return articles.map((a, i) => formatArticle(a, i + 1)).join('\n\n');
  }

  // Grouped by category
  const groups = groupByCategory(articles);
  const sections = [];
  let idx = 1;
  for (const [category, group] of groups) {
    sections.push(`=== ${category} ===`);
    for (const a of group) {
      sections.push(formatArticle(a, idx++));
    }
    sections.push('');
  }
  return sections.join('\n');
}

/**
 * Build system + user prompt
 * @param {Article[]} articles
 * @param {Object} options
 * @param {string} [options.language='vi']
 * @param {string} [options.style='digest']
 * @param {string} [options.audience='senior developers']
 * @returns {{ system: string, user: string }}
 */
export function buildPrompt(articles, options = {}) {
  const { language = 'vi', style = 'digest', audience = 'senior developers' } = options;

  const styleFn = STYLES[style]?.[language] || STYLES.digest[language] || STYLES.digest.vi;
  const systemPrompt = typeof styleFn === 'function' ? styleFn(audience) : styleFn;

  const articleList = formatArticleList(articles);
  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });

  return {
    system: systemPrompt,
    user: `Today's date is ${today}.\n\nHere are today's articles:\n\n${articleList}\n\nCreate the digest now.`,
  };
}
