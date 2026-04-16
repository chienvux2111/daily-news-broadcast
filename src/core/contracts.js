/**
 * ============================================
 * Plugin Contracts — Mọi plugin implement từ đây
 * ============================================
 * 
 * 3 loại plugin:
 *   1. Source    — Nơi lấy data (RSS, API, scrape, DB...)
 *   2. AI       — Model xử lý/tóm tắt (Claude, OpenAI, Gemini, local...)
 *   3. Output   — Nơi gửi kết quả (Telegram, Slack, Discord, Email, File...)
 * 
 * + Cache contract cho dedup
 */

// ============================================
// 1. SOURCE CONTRACT
// ============================================

/**
 * @typedef {Object} Article
 * @property {string}  id          - Unique identifier (URL hoặc hash)
 * @property {string}  title       - Tiêu đề bài viết
 * @property {string}  url         - Link gốc
 * @property {string}  content     - Nội dung / mô tả (plain text)
 * @property {string}  source      - Tên nguồn
 * @property {string}  [category]  - Phân loại
 * @property {string}  [author]    - Tác giả
 * @property {string}  [imageUrl]  - URL ảnh cover/hero của bài viết
 * @property {Date}    [publishedAt] - Ngày xuất bản
 * @property {Object}  [meta]      - Metadata tuỳ ý (tags, images, etc.)
 */

/**
 * Mỗi Source plugin phải implement interface này
 */
export class SourcePlugin {
  /** @returns {string} Unique plugin ID */
  get id() { throw new Error('Not implemented'); }

  /** @returns {string} Display name */
  get name() { throw new Error('Not implemented'); }

  /** @returns {string} Emoji icon */
  get icon() { return '📰'; }

  /**
   * Fetch articles từ source này
   * @param {Object} options
   * @param {number} [options.limit=5]      - Số bài tối đa
   * @param {Date}   [options.since]        - Chỉ lấy bài sau thời điểm này
   * @param {Object} [options.config]       - Source-specific config (API keys, etc.)
   * @returns {Promise<Article[]>}
   */
  async fetch(options = {}) { throw new Error('Not implemented'); }
}

// ============================================
// 2. AI PROVIDER CONTRACT
// ============================================

/**
 * @typedef {Object} SummaryResult
 * @property {string}  text       - Nội dung đã xử lý
 * @property {Object}  [usage]    - Token usage { input, output, cost }
 * @property {string}  [model]    - Model đã dùng
 */

/**
 * Mỗi AI plugin phải implement interface này
 */
export class AIPlugin {
  /** @returns {string} Unique plugin ID */
  get id() { throw new Error('Not implemented'); }

  /** @returns {string} Display name */
  get name() { throw new Error('Not implemented'); }

  /**
   * Xử lý / tóm tắt danh sách articles
   * @param {Article[]} articles   - Danh sách bài viết
   * @param {Object}    options
   * @param {string}    [options.language='vi']   - Ngôn ngữ output
   * @param {string}    [options.style='digest']  - Style: digest | bullet | thread | newsletter
   * @param {string}    [options.systemPrompt]    - Custom system prompt (override default)
   * @param {number}    [options.maxTokens=4096]
   * @returns {Promise<SummaryResult>}
   */
  async summarize(articles, options = {}) { throw new Error('Not implemented'); }
}

// ============================================
// 3. OUTPUT CONTRACT
// ============================================

/**
 * @typedef {Object} SendResult
 * @property {boolean} success
 * @property {string}  [messageId]   - ID của message đã gửi (nếu có)
 * @property {string}  [error]       - Lỗi nếu fail
 * @property {Object}  [meta]        - Metadata tuỳ ý
 */

/**
 * Mỗi Output plugin phải implement interface này
 */
export class OutputPlugin {
  /** @returns {string} Unique plugin ID */
  get id() { throw new Error('Not implemented'); }

  /** @returns {string} Display name */
  get name() { throw new Error('Not implemented'); }

  /**
   * Gửi nội dung đến output channel
   * @param {string} content       - Nội dung đã format
   * @param {Object} options
   * @param {Object} [options.config]  - Output-specific config (tokens, IDs, etc.)
   * @returns {Promise<SendResult>}
   */
  async send(content, options = {}) { throw new Error('Not implemented'); }

  /**
   * Max content length cho output này (dùng để split)
   * @returns {number}
   */
  get maxLength() { return Infinity; }
}

// ============================================
// 4. CACHE CONTRACT
// ============================================

export class CachePlugin {
  async get(key) { return null; }
  async set(key, value, ttlMs) {}
  async has(key) { return (await this.get(key)) !== null; }
  async delete(key) {}
}
