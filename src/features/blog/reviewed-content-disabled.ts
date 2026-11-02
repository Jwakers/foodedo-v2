import type { BlogSummary } from "./content";

/**
 * Sanity is the single source of truth for blog posts.
 * This no-op keeps call sites unchanged while disabling local overrides.
 */
export function applyReviewedContent<T extends BlogSummary>(article: T): T {
  return article;
}

