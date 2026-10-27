import type { BlogArticle, BlogSummary } from "./content";
import reviewedArticles from "./reviewed-articles.json";

const reviewedBySlug = new Map(
  reviewedArticles.map((article) => [article.slug, article]),
);

/** V2 editorial revisions. Public Sanity stays read-only; unknown/new posts stay live. */
export function applyReviewedContent<T extends BlogSummary>(article: T): T {
  const reviewed = reviewedBySlug.get(article.slug);
  if (!reviewed || reviewed.sourceId !== article._id) return article;
  const reviewedAt = `${reviewed.reviewedOn}T00:00:00.000Z`;
  return {
    ...article,
    title: reviewed.title,
    excerpt: reviewed.excerpt,
    seoDescription: reviewed.excerpt,
    _updatedAt: new Date(
      Math.max(
        Date.parse(article._updatedAt || article.publishedAt || reviewedAt),
        Date.parse(reviewedAt),
      ),
    ).toISOString(),
    // Summaries must stay small; bodies are applied only to article reads.
    ...("body" in article
      ? { body: reviewed.body as BlogArticle["body"] }
      : {}),
  };
}
