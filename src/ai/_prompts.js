/**
 * Shared prompt builder for all AI plugins
 * Generates system + user prompt based on language, style, audience, and platform
 * Supports both flat article lists and category-grouped articles
 */

import { groupByCategory } from '../core/grouping.js';
import { PLATFORM_RULES, HOOK_RULES } from './platform-rules.js';

// ============================================
// Style prompts (editorial instructions — platform-agnostic)
// ============================================

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
- Hashtags cuối`,

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
- Hashtags at end`,
  },

  bullet: {
    vi: () => `Tóm tắt danh sách tin kỹ thuật thành bullet points ngắn gọn bằng tiếng Việt. Mỗi tin 1 dòng, giữ thuật ngữ tiếng Anh. Kèm link.`,
    en: () => `Summarize tech articles as concise bullet points. One line each with link.`,
  },

  hot_take: {
    vi: (audience) => `Bạn là tech news commentator cho ${audience}. Viết Vietnamese-first Vietlish: giải thích bằng tiếng Việt tự nhiên, giữ thuật ngữ tech tiếng Anh.

TONE:
- Sharp, skeptical, witty, hơi contrarian nhưng có căn cứ
- Nói thẳng tradeoff cho dev/indie builder: cost, lock-in, distribution, DX, moat, speed to ship
- Gây tranh luận bằng lập luận, KHÔNG rage bait, KHÔNG bịa claim, KHÔNG công kích cá nhân/nhóm

FORMAT:
- Bắt đầu: "🔥 HOT TAKE - [DD/MM/YYYY]"
- Mỗi bài: 1 hot take ngắn → vì sao builders nên quan tâm → ai thắng/ai thua hoặc tradeoff chính → link
- "💡 BUILDER TAKEAWAY" — 2-3 việc độc giả có thể làm/kiểm chứng
- "🤔 DEBATE" — 1 câu hỏi dễ kéo comment
- Hashtags cuối`,

    en: (audience) => `You are a sharp tech commentator for ${audience}.

TONE:
- Opinionated, skeptical, witty, slightly contrarian, but defensible
- Focus on builder tradeoffs: cost, lock-in, distribution, DX, moat, speed to ship
- Be controversial through reasoning, not rage bait. Do not invent claims or attack people/groups.

FORMAT:
- Start: "🔥 HOT TAKE - [DD/MM/YYYY]"
- Each article: short hot take → why builders should care → winner/loser or core tradeoff → link
- "💡 BUILDER TAKEAWAY" — 2-3 practical actions/checks
- "🤔 DEBATE" — 1 comment-worthy question
- Hashtags at end`,
  },

  thread: {
    vi: () => `Viết chuỗi bài đăng (thread) cho mạng xã hội từ danh sách tin kỹ thuật. Tiếng Việt, giữ thuật ngữ tiếng Anh. Đánh số 1/n, 2/n...`,
    en: () => `Write a social media thread from tech articles. Number as 1/n, 2/n...`,
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
- "🔮 NEXT WEEK" — dự đoán/theo dõi`,
    en: (audience) => `Write a weekly tech recap for ${audience}.
Format: "📊 WEEKLY TECH RECAP - Week [N]"
- Top 3 "Must Read" — deep analysis 4-5 sentences each, why it matters
- "Trending Topics" — themes appearing multiple times this week
- "Quick Hits" — other news in 1 line each
- "🔮 NEXT WEEK" — predictions/watch items`,
  },

  mustread: {
    vi: (audience) => `Chọn 3 bài QUAN TRỌNG NHẤT từ danh sách cho ${audience}. Phân tích sâu mỗi bài (5-6 câu):
- Tại sao bài này quan trọng
- Impact với developers
- Key technical details
- Action items cho readers
Format: "⭐ MUST READ - [DD/MM/YYYY]"`,
    en: (audience) => `Pick the 3 MOST IMPORTANT articles for ${audience}. Deep analysis per article (5-6 sentences):
- Why this article matters
- Impact on developers
- Key technical details
- Action items for readers
Format: "⭐ MUST READ - [DD/MM/YYYY]"`,
  },
};

// ============================================
// Hook prompt builder (drip mode — single article)
// ============================================

/**
 * @param {Article} article
 * @param {Object} options
 * @param {string} [options.platform='telegram']
 * @param {string} [options.style='digest']
 * @param {string} [options.audience='dev Việt']
 * @returns {{ system: string, user: string }}
 */
export function buildHookPrompt(article, options = {}) {
  const { platform = 'telegram', style = 'digest', audience = 'dev Việt' } = options;
  const meta = article.meta || {};
  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const spicy = style === 'hot_take';

  const openers = spicy ? [
    'Mở đầu bằng 1 hot take dễ gây tranh luận nhưng có căn cứ',
    'Mở đầu bằng câu "Unpopular opinion:" rồi nói thẳng tradeoff',
    'Mở đầu bằng câu hỏi đụng đúng nỗi đau của indie builders',
    'Mở đầu bằng prediction ngắn về ai thắng/ai thua',
    'Mở đầu bằng comparison với một hype cycle quen thuộc',
  ] : [
    'Mở đầu bằng 1 insight ngắn gọn',
    'Mở đầu bằng 1 câu hỏi rhetorical',
    'Mở đầu bằng reaction cá nhân kiểu "Vừa đọc cái này..."',
    'Mở đầu bằng comparison với cái gì đó quen thuộc',
    'Mở đầu bằng prediction ngắn',
    'Mở đầu bằng confession kiểu "Ngl mình skeptical lúc đầu nhưng..."',
    'Mở đầu thẳng vào vấn đề, không dạo đầu',
  ];
  const opener = openers[Math.floor(Math.random() * openers.length)];
  const rules = HOOK_RULES[platform] || HOOK_RULES.telegram;

  const editorialMode = spicy
    ? `Viết 1 post hot take về bài tech news bên dưới cho ${audience}. Vietnamese-first Vietlish: giải thích bằng tiếng Việt tự nhiên, giữ thuật ngữ tech tiếng Anh.

GÓC NHÌN:
- Sharp, skeptical, witty, hơi contrarian nhưng vẫn fair
- Nói rõ impact với dev/indie builders: cost, lock-in, distribution, DX, moat, speed to ship
- Gây tranh luận bằng tradeoff thật, KHÔNG rage bait, KHÔNG bịa claim, KHÔNG công kích cá nhân/nhóm`
    : `Viết 1 post tóm tắt bài tech news bên dưới. Viết như dev Việt share tin cho anh em — Vietnglish tự nhiên, không formal, không robot. KHÔNG bình luận/đánh giá/opinion trừ khi prompt style yêu cầu.`;

  const structure = spicy
    ? `CẤU TRÚC 1 ĐOẠN:
Hot take → chuyện gì xảy ra → why builders should care → tradeoff/thắng-thua → 1 câu hỏi debate. (3-5 câu)`
    : `CẤU TRÚC 1 ĐOẠN TÓM TẮT:
Chuyện gì đang xảy ra? Ai làm gì? Có gì đáng chú ý? Tóm lại ngắn gọn, dễ hiểu, giữ thuật ngữ tech tiếng Anh. (3-5 câu)`;

  const system = `${editorialMode}

${structure}

${rules.examples}

${rules.format}
- ${opener}`;

  const articleInfo = [
    `Title: "${article.title}"`,
    `Source: ${article.source}`,
    `URL: ${article.url}`,
    article.content ? `Content: ${article.content.substring(0, 800)}` : '',
    article.category ? `Category: ${article.category}` : '',
    meta.points ? `HN Points: ${meta.points}` : '',
    meta.upvotes ? `Upvotes: ${meta.upvotes}` : '',
    meta.stars ? `GitHub Stars: ${meta.stars}` : '',
    meta.alsoFrom?.length ? `Also trending on: ${meta.alsoFrom.join(', ')}` : '',
  ].filter(Boolean).join('\n');

  return {
    system,
    user: `Today is ${today}.\n\n${articleInfo}\n\nWrite the hook post now.`,
  };
}

// ============================================
// Digest prompt builder
// ============================================

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

function formatArticleList(articles) {
  const categories = new Set(articles.map(a => a.category).filter(Boolean));
  if (categories.size <= 1) {
    return articles.map((a, i) => formatArticle(a, i + 1)).join('\n\n');
  }
  const groups = groupByCategory(articles);
  const sections = [];
  let idx = 1;
  for (const [category, group] of groups) {
    sections.push(`=== ${category} ===`);
    for (const a of group) sections.push(formatArticle(a, idx++));
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
 * @param {string} [options.platform='telegram']
 * @returns {{ system: string, user: string }}
 */
export function buildPrompt(articles, options = {}) {
  const { language = 'vi', style = 'digest', audience = 'senior developers', platform = 'telegram' } = options;

  const styleFn = STYLES[style]?.[language] || STYLES.digest[language] || STYLES.digest.vi;
  const systemPrompt = typeof styleFn === 'function' ? styleFn(audience) : styleFn;
  const platformRules = PLATFORM_RULES[platform] || PLATFORM_RULES.telegram;

  const articleList = formatArticleList(articles);
  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });

  return {
    system: `${systemPrompt}\n\n${platformRules}`,
    user: `Today's date is ${today}.\n\nHere are today's articles:\n\n${articleList}\n\nCreate the digest now.`,
  };
}
