"use client";

import {
  isPublicRecipePath,
  parseRecipeDetailSlug,
} from "@/lib/routing/recipes";
import { useCatalogueMeal } from "./use-catalogue";
import { useRecipeSource } from "./use-recipe-source";

/** Resolve catalogue actions from the same pinned or personal source as the body. */
export function useRecipeHeader(
  pathname: string,
  searchParams: Pick<URLSearchParams, "get">,
) {
  const slug = parseRecipeDetailSlug(pathname, searchParams);
  const { meal, personalRecipeId, personalMeal } = useRecipeSource(
    isPublicRecipePath(pathname) ? new URLSearchParams() : searchParams,
    slug,
  );
  const source = personalMeal?.source;
  const snapshotCatalogueMeal = useCatalogueMeal(
    source?.type === "catalogue" ? source.catalogueMealId : null,
    source?.type === "catalogue" ? source.catalogueVersion : null,
  );
  return personalRecipeId ? snapshotCatalogueMeal : meal;
}
