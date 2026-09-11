"use client";

import { RecipeDetailContent } from "@/features/recipes/recipe-detail-content";
import type { CatalogueMeal } from "@/lib/domain/recipes";

export function RecipeDetailPage({ meal }: { meal: CatalogueMeal }) {
  return (
    <div className="mx-auto w-full max-w-175">
      <RecipeDetailContent meal={meal} presentation="page" />
    </div>
  );
}
