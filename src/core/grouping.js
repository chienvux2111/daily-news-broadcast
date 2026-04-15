/**
 * Category grouping — groups articles by category for structured digest output
 * Pure function, no side effects. Used by buildPrompt() to create sectioned prompts.
 */

/**
 * Group articles by category, sorted by total group score (highest first)
 * @param {Article[]} articles
 * @returns {Array<[string, Article[]]>} - Tuples of [categoryName, articles[]]
 */
export function groupByCategory(articles) {
  const groups = {};
  for (const article of articles) {
    const cat = article.category || 'General';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(article);
  }

  return Object.entries(groups)
    .sort(([, a], [, b]) => {
      const scoreA = a.reduce((sum, x) => sum + (x.meta?.score || 0), 0);
      const scoreB = b.reduce((sum, x) => sum + (x.meta?.score || 0), 0);
      return scoreB - scoreA;
    });
}
