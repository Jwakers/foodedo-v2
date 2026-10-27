import { expect, test } from "@playwright/test";
import { applyReviewedContent } from "../../src/features/blog/reviewed-content";
import reviewed from "../../src/features/blog/reviewed-articles.json";
import {
  blogArticleSchema,
  blogSummarySchema,
  type BlogArticle,
} from "../../src/features/blog/content";
import inventory from "../../docs/blog-url-inventory.json";
import guides from "../../src/features/blog/guides.json";
import pages from "../../src/features/public-pages/pages.json";

test("all inventoried CMS articles have a valid V2 review with no retired product instructions", () => {
  expect(reviewed.map((article) => `/blog/${article.slug}`).sort()).toEqual(
    inventory.cmsArticles.map((article) => article.path).sort(),
  );
  for (const article of reviewed) {
    expect(
      blogArticleSchema.safeParse({ ...article, _id: article.sourceId })
        .success,
      article.slug,
    ).toBe(true);
    const text = article.body
      .flatMap((block) =>
        "children" in block ? block.children.map((span) => span.text) : [],
      )
      .join(" ");
    expect(text, article.slug).not.toMatch(
      /chalkboard|Discover (?:feature|tab|section)|share your Foodedo account|Use Tags and Labels|90%|free trial/i,
    );
  }
});

test("review applies consistently to article, index and metadata without copying a body into summaries", () => {
  for (const review of reviewed) {
    const summary = {
      _id: review.sourceId,
      slug: review.slug,
      title: "V1 title",
      excerpt: "V1 excerpt",
      publishedAt: "2026-05-01T12:00:00.000Z",
      _updatedAt: "2026-05-02T12:00:00.000Z",
    };
    const article: BlogArticle = { ...summary, body: [] };
    const corrected = applyReviewedContent(article);
    expect(corrected.title).toBe(review.title);
    expect(corrected.body).toEqual(review.body);
    expect(corrected.excerpt).toBe(review.excerpt);
    expect(corrected.seoDescription).toBe(review.excerpt);
    expect(corrected.publishedAt).toBe(summary.publishedAt);
    expect(corrected._updatedAt).toBe("2026-10-27T00:00:00.000Z");
    const index = applyReviewedContent(summary);
    expect(blogSummarySchema.safeParse(index).success).toBe(true);
    expect(index.title).toBe(corrected.title);
    expect(index).not.toHaveProperty("body");
  }
});

test("new posts and reused slugs retain CMS content until explicitly reviewed", () => {
  const unrelated = {
    _id: "new-document",
    slug: reviewed[0].slug,
    title: "New content",
  };
  expect(applyReviewedContent(unrelated)).toBe(unrelated);
  const fresh = { ...unrelated, slug: "a-new-article" };
  expect(applyReviewedContent(fresh)).toBe(fresh);
});

test("local help describes setup before generation and has no chalkboard instructions", () => {
  expect(JSON.stringify([...guides, ...pages])).not.toMatch(
    /chalkboard|Discover tab|free trial/i,
  );
  const howTo = pages.find((page) => page.path === "/support/how-to-use")!;
  expect(howTo.sections[0].body).toContain("In Plan your week");
  expect(howTo.sections[0].body).toContain("start date and servings");
  expect(howTo.sections.at(-1)?.body).toContain("save automatically");
});
