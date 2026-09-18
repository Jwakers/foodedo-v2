import { ConvexHttpClient } from "convex/browser";
import type { MetadataRoute } from "next";

import { api } from "../../convex/_generated/api";

const defaultSiteUrl = "https://foodedo.com";

export const dynamic = "force-static";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = new URL(process.env.SITE_URL?.trim() || defaultSiteUrl);
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL?.trim();
  if (!convexUrl) {
    throw new Error("NEXT_PUBLIC_CONVEX_URL is required to build the sitemap.");
  }
  const convex = new ConvexHttpClient(convexUrl);
  const meals = await convex.query(api.catalogue.getSitemapMeals, {});

  return meals.map(({ slug, publishedAt }) => {
    const url = new URL("/recipes/view", siteUrl);
    url.searchParams.set("slug", slug);
    return {
      url: url.toString(),
      lastModified: new Date(publishedAt),
    };
  });
}
