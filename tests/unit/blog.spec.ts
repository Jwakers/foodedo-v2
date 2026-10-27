import { expect, test } from "@playwright/test";
import {
  blogArticleSchema,
  blogImageUrl,
  blogImageDimensions,
  inlineImageSchema,
  resolveBlogLink,
} from "../../src/features/blog/content";
import { localGuides } from "../../src/features/blog/guides";
import {
  articleMetadata,
  articleStructuredData,
  jsonLd,
} from "../../src/features/blog/metadata";
import {
  publishedPostFilter,
  querySanity,
} from "../../src/features/blog/sanity-query";
import inventory from "../../docs/blog-url-inventory.json";
import { sitemapResponse } from "../../src/lib/seo/sitemap-response";

const image = {
  asset: {
    _ref: "image-e77baadcd5efcd2e5c7d26a0b6abbf071bc87499-1408x768-png",
  },
};

test("preserves all six guides and their original URLs without fabricated dates", () => {
  expect(localGuides.map(({ slug }) => `/blog/${slug}`)).toEqual(
    inventory.localGuides.map(({ path }) => path),
  );
  for (const guide of localGuides) {
    expect(blogArticleSchema.safeParse(guide).success).toBe(true);
    expect(guide.body?.length).toBeGreaterThan(0);
    const structured = JSON.parse(jsonLd(articleStructuredData(guide)));
    expect(structured).not.toHaveProperty("datePublished");
    expect(structured).not.toHaveProperty("dateModified");
    expect(structured).not.toHaveProperty("author");
    expect(articleMetadata(guide).alternates?.canonical).toContain(
      `/blog/${guide.slug}`,
    );
  }
});

test("handles optional images and uses nested image assets without losing captions", () => {
  const parsed = inlineImageSchema.parse({
    _type: "pteImage",
    image,
    caption: "Dinner",
    alt: "Food",
  });
  expect(blogImageUrl(parsed.image, 800)).toContain(
    "e77baadcd5efcd2e5c7d26a0b6abbf071bc87499-1408x768.png",
  );
  expect(blogImageUrl(null, 800)).toBeUndefined();
  expect(blogImageUrl({ asset: { _ref: "missing" } }, 800)).toBeUndefined();
});

test("resolves V1 links while preserving external URLs, query strings and fragments", () => {
  expect(resolveBlogLink("#ingredients")).toBe("#ingredients");
  expect(resolveBlogLink("?print=1#ingredients")).toBe("?print=1#ingredients");
  expect(
    resolveBlogLink(
      "https://www.foodedo.com/dashboard/meal-plan?week=1#dinner",
    ),
  ).toBe("/week?week=1#dinner");
  expect(resolveBlogLink("/dashboard/shopping-list")).toBe("/shop");
  expect(resolveBlogLink("/dashboard/import-recipe")).toBe("/recipes/import");
  expect(resolveBlogLink("/discover")).toBe("/recipes");
  expect(resolveBlogLink("/pricing?source=blog#free")).toBe(
    "/faq?source=blog#free",
  );
  expect(resolveBlogLink("https://www.foodedo.com/support/contact")).toBe(
    "/support/contact",
  );
  expect(resolveBlogLink("/beta")).toBe("/");
  expect(
    resolveBlogLink(
      "/discover/recipe/chicken-tacos-with-salsa?source=blog#ingredients",
    ),
  ).toBe("/recipes/chicken-tacos-with-avocado-salsa?source=blog#ingredients");
  expect(resolveBlogLink("/sign-up?source=blog")).toBe("/?try=1&source=blog");
  expect(resolveBlogLink("/how-to-build-shopping-list-from-meal-plan")).toBe(
    "/blog/how-to-build-shopping-list-from-meal-plan",
  );
  expect(resolveBlogLink("/blog/how-to-start-meal-planning#start")).toBe(
    "/blog/how-to-start-meal-planning#start",
  );
  expect(resolveBlogLink("https://example.com/recipe")).toBe(
    "https://example.com/recipe",
  );
  expect(resolveBlogLink("data:text/html,bad")).toBeUndefined();
  expect(resolveBlogLink("\n javaSCRIPT:alert(1)")).toBeUndefined();
});

test("reserves the cropped image aspect ratio rather than the uncropped asset ratio", () => {
  const cropped = {
    ...image,
    crop: { left: 0, right: 0.5, top: 0.125, bottom: 0.125 },
  };
  expect(blogImageDimensions(cropped)).toEqual({ width: 704, height: 576 });
  expect(new URL(blogImageUrl(cropped, 1440)!).searchParams.get("rect")).toBe(
    "0,96,704,576",
  );
  expect(blogImageDimensions(image)).toEqual({ width: 1408, height: 768 });
});

test("escapes structured data script boundaries and preserves actual editorial dates", () => {
  const article = {
    _id: "article",
    title: "Dinner </script><script>bad</script>",
    slug: "dinner",
    publishedAt: "2026-05-14T12:42:26.878Z",
    _updatedAt: "2026-05-15T12:42:26.878Z",
    mainImage: image,
  };
  const text = jsonLd(articleStructuredData(article));
  expect(text).not.toContain("</script>");
  expect(JSON.parse(text).headline).toBe(article.title);
  expect(JSON.parse(text).datePublished).toBe(article.publishedAt);
  expect(articleMetadata(article).openGraph).toHaveProperty("type", "article");
});

test("reads published content with a 60-second cache and encoded slug parameters", async () => {
  const fetcher: typeof fetch = async (input, options) => {
    const url = new URL(String(input));
    expect(url.hostname).toBe("i8ook8b1.api.sanity.io");
    expect(url.searchParams.get("perspective")).toBe("published");
    expect(url.searchParams.get("query")).toContain(
      '!(_id in path("drafts.**"))',
    );
    expect(JSON.parse(url.searchParams.get("$slug")!)).toBe('a-quote"');
    expect(options).toMatchObject({
      cache: "force-cache",
      next: { revalidate: 60 },
    });
    expect(options?.headers).toBeUndefined();
    return Response.json({ result: null });
  };
  await expect(
    querySanity(
      `*[${publishedPostFilter} && slug.current == $slug][0]`,
      { slug: 'a-quote"' },
      fetcher,
    ),
  ).resolves.toEqual({ result: null });
});

test("CMS outages and malformed responses cannot masquerade as a missing article", async () => {
  await expect(
    querySanity(
      "*[]",
      {},
      async () => new Response("Unavailable", { status: 503 }),
    ),
  ).rejects.toThrow("503");
  await expect(
    querySanity("*[]", {}, async () => {
      throw new Error("Network down");
    }),
  ).rejects.toThrow("Network down");
  await expect(
    querySanity("*[]", {}, async () => new Response("not json")),
  ).rejects.toThrow();
  expect(blogArticleSchema.nullable().safeParse(undefined).success).toBe(false);
  expect(blogArticleSchema.nullable().safeParse(null).success).toBe(true);
});

test("sitemap XML escapes URLs and does not invent modification dates", async () => {
  const response = sitemapResponse([
    { url: "https://foodedo.com/recipes/view?slug=meal&servings=2" },
    {
      url: "https://foodedo.com/blog/dinner",
      lastModified: "2026-05-14T12:42:26.878Z",
    },
  ]);
  const xml = await response.text();
  expect(response.headers.get("Content-Type")).toContain("application/xml");
  expect(xml).toContain("slug=meal&amp;servings=2");
  expect((xml.match(/<lastmod>/g) ?? []).length).toBe(1);
  expect(xml).toContain("2026-05-14T12:42:26.878Z");
});
