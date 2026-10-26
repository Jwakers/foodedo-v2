"use client";

import type { CatalogueMeal } from "@/lib/domain/recipes";
import { RecipeDetailContent } from "./recipe-detail-content";
import { useCurrentCatalogueMeal } from "./use-catalogue";
import { PlanThisMeal } from "@/features/plan/plan-this-meal";
import { recipeStructuredData } from "@/features/public-recipes/metadata";
import { jsonLd } from "@/lib/seo/structured-data";

/** Server seed provides initial HTML; the existing live query enhances it after hydration. */
export function PublicRecipeDetail({
  initialRecipe,
  canonicalUrl,
}: {
  initialRecipe: CatalogueMeal;
  canonicalUrl: string;
}) {
  const current = useCurrentCatalogueMeal(initialRecipe.slug);
  const recipe = current ?? initialRecipe;
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLd(recipeStructuredData(recipe, canonicalUrl)),
        }}
      />
      <RecipeDetailContent
        meal={recipe}
        presentation="page"
        planMealAction={<PlanThisMeal meal={recipe} />}
      />
    </>
  );
}
