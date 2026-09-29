"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

import { PlanThisMeal } from "@/features/plan/plan-this-meal";
import { RecipeDetailContent } from "@/features/recipes/recipe-detail-content";
import {
  useCatalogueMeal,
  useCurrentCatalogueMeal,
} from "@/features/recipes/use-catalogue";
import { Button } from "@/components/ui/button";
import { parseRecipeCatalogueReference } from "@/lib/routing/recipes";

export function RecipeDetailPage() {
  const searchParams = useSearchParams();
  const slug = searchParams.get("slug")?.trim() || null;
  const reference = parseRecipeCatalogueReference(searchParams);
  const pinnedMeal = useCatalogueMeal(
    reference?.catalogueMealId ?? null,
    reference?.catalogueVersion ?? null,
  );
  const currentMeal = useCurrentCatalogueMeal(reference === null ? slug : null);
  const meal = reference === null ? currentMeal : pinnedMeal;

  useEffect(() => {
    if (meal) document.title = `${meal.title} · Foodedo`;
    return () => {
      document.title = "Foodedo";
    };
  }, [meal]);

  if (slug === null || meal === null) {
    return (
      <main className="mx-auto w-full max-w-175 px-page-inline py-16 text-center">
        <h1 className="font-display text-28 font-semibold text-ink">
          Recipe unavailable
        </h1>
        <p className="mt-2 text-14 text-graphite">
          This recipe could not be found in the current catalogue.
        </p>
        <Button className="mt-5" onClick={() => window.location.reload()}>
          Try again
        </Button>
      </main>
    );
  }

  if (meal === undefined) {
    return (
      <main className="mx-auto w-full max-w-175 px-page-inline py-16 text-center text-14 text-graphite">
        Loading recipe…
      </main>
    );
  }

  return (
    <div className="mx-auto w-full max-w-175">
      <RecipeDetailContent
        meal={meal}
        presentation="page"
        planMealAction={<PlanThisMeal meal={meal} />}
      />
    </div>
  );
}
