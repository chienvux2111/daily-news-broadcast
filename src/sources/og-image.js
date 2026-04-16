/**
 * Shared utility: fetch og:image from article pages
 * Used by source plugins to enrich articles missing imageUrl
 */

/**
 * Fetch og:image from article pages for articles missing imageUrl.
 * Runs concurrent requests with short timeout — failures silently ignored.
 * @param {Array<{imageUrl?: string, url?: string}>} articles
 */
export async function enrichMissingImages(articles) {
  const missing = articles.filter(a => !a.imageUrl && a.url);
  if (missing.length === 0) return;

  const results = await Promise.allSettled(
    missing.map(a => fetchOgImage(a.url))
  );

  for (let i = 0; i < missing.length; i++) {
    if (results[i].status === 'fulfilled' && results[i].value) {
      missing[i].imageUrl = results[i].value;
    }
  }
}

/**
 * Fetch a page and extract og:image meta tag.
 * Reads only first 50KB to find the tag quickly.
 * @param {string} url
 * @returns {Promise<string|null>}
 */
async function fetchOgImage(url) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'NewsEngine/2.0' },
    });
    clearTimeout(timer);

    if (!res.ok) return null;

    // Stream only first 50KB — og:image is always in <head>
    const reader = res.body.getReader();
    let html = '';
    const decoder = new TextDecoder();
    while (html.length < 50000) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
    }
    reader.cancel();

    const match = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']*)["']/i)
      || html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*property=["']og:image["']/i);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}
