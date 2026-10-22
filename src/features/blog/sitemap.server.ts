import "server-only";

import type { MetadataRoute } from "next";
import { getPublishedRecipes } from "@/features/public-recipes/catalogue.server";
import { publicRecipePath } from "@/lib/routing/recipes";
import { siteUrl } from "@/lib/seo/site-url";
import { getPublishedPosts } from "@/features/blog/sanity.server";
import { localGuides } from "@/features/blog/guides";

export async function blogSitemap(): Promise<MetadataRoute.Sitemap> {
  const [meals, posts] = await Promise.all([
    getPublishedRecipes(),
    getPublishedPosts(),
  ]);
  const articles = new Map(
    [...posts, ...localGuides].map((article) => [article.slug, article]),
  );
  return [
    { url: siteUrl() },
    { url: siteUrl("/blog") },
    { url: siteUrl("/recipes") },
    ...meals.map((meal) => ({ url: siteUrl(publicRecipePath(meal.slug)) })),
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
