import { ConvexHttpClient } from "convex/browser";
import type { MetadataRoute } from "next";

import { api } from "../../../convex/_generated/api";
import { siteUrl as canonicalSiteUrl } from "./site-url";

export async function catalogueSitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = new URL(canonicalSiteUrl());
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
