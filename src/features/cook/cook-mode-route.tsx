"use client";

import { useSearchParams } from "next/navigation";

import { CookModePage } from "@/features/cook/cook-mode-page";
import { Button } from "@/components/ui/button";
import {
  useCatalogueMeal,
  useCurrentCatalogueMeal,
} from "@/features/recipes/use-catalogue";
import { parseRecipeCatalogueReference } from "@/lib/routing/recipes";

export function CookModeRoute() {
  const searchParams = useSearchParams();
  const slug = searchParams.get("slug")?.trim() || null;
  const reference = parseRecipeCatalogueReference(searchParams);
  const pinnedMeal = useCatalogueMeal(
    reference?.catalogueMealId ?? null,
    reference?.catalogueVersion ?? null,
  );
  const currentMeal = useCurrentCatalogueMeal(reference === null ? slug : null);
  const meal = reference === null ? currentMeal : pinnedMeal;

  if (slug === null || meal === null) {
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
  return <CookModePage meal={meal} catalogueVersion={meal.version} />;
}
