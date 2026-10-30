"use client";

import {
  parsePersonalRecipeId,
  parseRecipeCatalogueReference,
} from "@/lib/routing/recipes";
import { useCatalogueMeal, useCurrentCatalogueMeal } from "./use-catalogue";
import { usePersonalRecipe } from "./use-personal-recipe";

/** Detail and Cook share identity/revision selection, not their presentation. */
export function useRecipeSource(searchParams: Pick<URLSearchParams, "get">) {
  const slug = searchParams.get("slug")?.trim() || null;
  const personalRecipeId = parsePersonalRecipeId(searchParams);
  const reference = parseRecipeCatalogueReference(searchParams);
  const pinnedMeal = useCatalogueMeal(
    reference?.catalogueMealId ?? null,
    reference?.catalogueVersion ?? null,
  );
  const currentMeal = useCurrentCatalogueMeal(reference === null ? slug : null);
  const personalMeal = usePersonalRecipe(personalRecipeId);
  const catalogueMeal = reference === null ? currentMeal : pinnedMeal;
  return {
    slug,
    personalRecipeId,
    personalMeal,
    meal: personalRecipeId ? personalMeal : catalogueMeal,
  };
}
