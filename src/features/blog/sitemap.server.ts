import "server-only";

import type { MetadataRoute } from "next";
import { catalogueSitemap } from "@/lib/seo/catalogue-sitemap";
import { siteUrl } from "@/lib/seo/site-url";
import { getPublishedPosts } from "@/features/blog/sanity.server";
import { localGuides } from "@/features/blog/guides";

export async function blogSitemap(): Promise<MetadataRoute.Sitemap> {
  const [meals, posts] = await Promise.all([
    catalogueSitemap(),
    getPublishedPosts(),
  ]);
  const articles = new Map(
    [...posts, ...localGuides].map((article) => [article.slug, article]),
  );
  return [
    { url: siteUrl() },
    { url: siteUrl("/blog") },
    ...meals,
    ...[...articles.values()].map((article) => ({
      url: siteUrl(`/blog/${article.slug}`),
      ...(article._updatedAt || article.publishedAt
        ? {
            lastModified: new Date(
              (article._updatedAt || article.publishedAt)!,
            ),
          }
        : {}),
    })),
  ];
}
