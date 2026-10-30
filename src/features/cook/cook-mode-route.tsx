"use client";

import { useSearchParams } from "next/navigation";

import { CookModePage } from "@/features/cook/cook-mode-page";
import { Button } from "@/components/ui/button";
import { parseRecipeServings } from "@/lib/routing/recipes";
import { useRecipeSource } from "@/features/recipes/use-recipe-source";
import { useFoodedoAuth } from "@/features/auth/use-foodedo-auth";
import { RecipeAccountRecovery } from "@/features/recipes/recipe-account-recovery";

export function CookModeRoute() {
  const { status, isAuthenticated } = useFoodedoAuth();
  const searchParams = useSearchParams();
  const { slug, personalRecipeId, meal } = useRecipeSource(searchParams);
  const explicitServings = parseRecipeServings(searchParams.get("servings"));

  if (personalRecipeId && !isAuthenticated)
    return <RecipeAccountRecovery status={status} />;

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
  if (meal === undefined) {
    return (
      <main className="min-h-dvh bg-paper" aria-label="Loading cook mode" />
    );
  }
  return (
    <CookModePage
      meal={meal}
      catalogueVersion={meal.version}
      servings={explicitServings ?? meal.servings ?? 1}
      personalRecipeId={personalRecipeId ?? undefined}
    />
  );
}
