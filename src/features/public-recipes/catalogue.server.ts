import "server-only";

import { ConvexHttpClient } from "convex/browser";
import { unstable_cache } from "next/cache";
import { cache } from "react";
import { api } from "../../../convex/_generated/api";
import type { CatalogueMeal, CatalogueMealSummary } from "@/lib/domain/recipes";

export const recipeRevalidateSeconds = 86_400;
export const directoryRevalidateSeconds = 1_800;

function deploymentUrl() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL?.trim();
  if (!url)
    throw new Error("NEXT_PUBLIC_CONVEX_URL is required for public recipes.");
  return url;
}

function client(url: string) {
  // No credentials or mutable shared client. Cache decoded successes, never SDK
  // errors. Keep the SDK's transport uncached inside Next's persistent cache.
  return new ConvexHttpClient(url, {
    fetch: (input, init) =>
      fetch(input, {
        ...init,
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      }),
  });
}

// Cache Components remains disabled for the shared static-export architecture.
// unstable_cache supports cached SDK queries without changing that architecture.
export const getPublishedRecipes = cache(
  async (): Promise<CatalogueMealSummary[]> => {
    const url = deploymentUrl();
    return unstable_cache(
      async () => {
        const catalogue = await client(url).query(api.catalogue.getCurrent, {});
        return catalogue?.meals ?? [];
      },
      ["public-recipes-list-v1", url],
      { revalidate: directoryRevalidateSeconds },
    )();
  },
);

export const getPublicRecipe = cache(
  async (slug: string): Promise<CatalogueMeal | null> => {
    if (slug.length > 160 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
      return null;
    const url = deploymentUrl();
    // Never gate this lookup on the directory/build-time list: a newly published
    // slug must be readable before the listing's next refresh.
    return unstable_cache(
      async (recipeSlug: string) => {
        return client(url).query(api.catalogue.getCurrentMealBySlug, {
          slug: recipeSlug,
        });
      },
      ["public-recipe-detail-v1", url],
      { revalidate: recipeRevalidateSeconds },
    )(slug);
  },
);

/** Only the first page is embedded in the public directory's HTML/RSC payload. */
export const getPublishedRecipePage = cache(async () => {
  const url = deploymentUrl();
  return unstable_cache(
    () =>
      client(url).query(api.catalogue.list, {
        paginationOpts: { numItems: 20, cursor: null },
      }),
    ["public-recipes-page-v1", url],
    { revalidate: directoryRevalidateSeconds },
  )();
});
