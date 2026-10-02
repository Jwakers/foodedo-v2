"use client";

import { useSearchParams } from "next/navigation";

import { CookModePage } from "@/features/cook/cook-mode-page";
import { Button } from "@/components/ui/button";
import {
  useCatalogueMeal,
  useCurrentCatalogueMeal,
} from "@/features/recipes/use-catalogue";
import { parseRecipeCatalogueReference } from "@/lib/routing/recipes";
import { parsePersonalRecipeId } from "@/lib/routing/recipes";
import { parseRecipeServings } from "@/lib/routing/recipes";
import { useDefaultRecipeServings } from "@/features/recipes/use-default-recipe-servings";
import { usePersonalRecipe } from "@/features/recipes/use-personal-recipe";

export function CookModeRoute() {
  const searchParams = useSearchParams();
  const slug = searchParams.get("slug")?.trim() || null;
  const personalRecipeId = parsePersonalRecipeId(searchParams);
  const reference = parseRecipeCatalogueReference(searchParams);
  const explicitServings = parseRecipeServings(searchParams.get("servings"));
  const { defaultServings, isLoading: isLoadingDefaultServings } =
    useDefaultRecipeServings(explicitServings !== null);
  const pinnedMeal = useCatalogueMeal(
    reference?.catalogueMealId ?? null,
    reference?.catalogueVersion ?? null,
  );
  const currentMeal = useCurrentCatalogueMeal(reference === null ? slug : null);
  const personalMeal = usePersonalRecipe(personalRecipeId);
  const catalogueMeal = reference === null ? currentMeal : pinnedMeal;
  const meal = personalRecipeId ? personalMeal : catalogueMeal;

  if ((slug === null && personalRecipeId === null) || meal === null) {
    return (
      <main className="min-h-dvh bg-paper px-page-inline py-16 text-center">
        <h1 className="font-display text-28 font-semibold text-ink">
          Recipe unavailable
        </h1>
        <p className="mt-2 text-14 text-graphite">
          This recipe could not be opened in Cook Mode.
        </p>
        <Button className="mt-5" onClick={() => window.location.reload()}>
          Try again
        </Button>
      </main>
    );
  }
  if (meal === undefined || isLoadingDefaultServings) {
    return (
      <main className="min-h-dvh bg-paper" aria-label="Loading cook mode" />
    );
  }
  return (
    <CookModePage
      meal={meal}
      catalogueVersion={meal.version}
      servings={
        explicitServings ??
        (personalRecipeId ? meal.servings : defaultServings) ??
        meal.servings ??
        1
      }
      personalRecipeId={personalRecipeId ?? undefined}
    />
  );
}
