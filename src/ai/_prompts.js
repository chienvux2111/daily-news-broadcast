/**
 * Shared prompt builder cho tất cả AI plugins
 * Tạo system + user prompt dựa trên language và style
 */

const STYLES = {
  digest: {
    vi: `Bạn là tech news curator chuyên nghiệp. Tạo bản tin kỹ thuật hàng ngày.

FORMAT:
- Bắt đầu: "🔥 DAILY TECH DIGEST - [DD/MM/YYYY]"
- Mỗi bài: emoji + tên nguồn in đậm, tiêu đề in nghiêng, tóm tắt 2-3 câu tiếng Việt (giữ thuật ngữ kỹ thuật tiếng Anh), link gốc
- Kết: "💡 KEY TAKEAWAY" + hashtags
- Dùng Telegram formatting: *bold*, _italic_
- KHÔNG dùng ## markdown headers
- Tối đa 4000 ký tự`,

    en: `You are a professional tech news curator. Create a daily digest.

FORMAT:
- Start: "🔥 DAILY TECH DIGEST - [DD/MM/YYYY]"
- Each article: emoji + bold source, italic title, 2-3 sentence summary, link
- End: "💡 KEY TAKEAWAY" + hashtags
- Use Telegram formatting: *bold*, _italic_
- NO markdown headers (##)
- Max 4000 characters`,
  },

  bullet: {
    vi: `Tóm tắt danh sách tin kỹ thuật thành bullet points ngắn gọn bằng tiếng Việt. Mỗi tin 1 dòng, giữ thuật ngữ tiếng Anh. Kèm link.`,
    en: `Summarize tech articles as concise bullet points. One line each with link.`,
  },

  thread: {
    vi: `Viết chuỗi bài đăng (thread) cho mạng xã hội từ danh sách tin kỹ thuật. Mỗi bài 280 ký tự. Tiếng Việt, giữ thuật ngữ tiếng Anh. Đánh số 1/n, 2/n...`,
    en: `Write a social media thread from tech articles. Each post max 280 chars. Number as 1/n, 2/n...`,
  },

  newsletter: {
    vi: `Viết newsletter kỹ thuật tuần từ danh sách bài viết. Tiếng Việt, giữ thuật ngữ tiếng Anh. Format: mở đầu thân mật → phân tích từng bài → kết luận insight.`,
    en: `Write a weekly tech newsletter from the articles. Friendly intro → analysis per article → closing insight.`,
  },
};

/**
 * Build system + user prompt
 * @param {Article[]} articles
 * @param {Object} options
 * @param {string} [options.language='vi']
 * @param {string} [options.style='digest']
 * @returns {{ system: string, user: string }}
 */
export function buildPrompt(articles, options = {}) {
  const { language = 'vi', style = 'digest' } = options;

  const systemPrompt = STYLES[style]?.[language] || STYLES.digest.vi;

  const articleList = articles.map((a, i) => {
    const meta = a.meta || {};
    const icon = meta.icon || '📰';
    return `${i + 1}. [${icon} ${a.source}] "${a.title}"
   URL: ${a.url}
   ${a.content ? `Content: ${a.content.substring(0, 300)}` : ''}
   ${a.category ? `Category: ${a.category}` : ''}`.trim();
  }).join('\n\n');

  return {
    system: systemPrompt,
    user: `Here are today's articles:\n\n${articleList}\n\nCreate the digest now.`,
  };
}
