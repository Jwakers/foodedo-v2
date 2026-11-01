import type { Metadata } from "next";
import { Suspense } from "react";

import { RecipeDetailPage } from "@/features/recipes/recipe-detail-page";
import { RecipeDetailLoading } from "@/features/recipes/recipe-detail-loading";

export const metadata: Metadata = {
  title: "Recipe · Foodedo",
  description: "Ingredients and method for a Foodedo recipe.",
  robots: { index: false },
};

export default function RecipeViewPage() {
  return (
    <Suspense fallback={<RecipeDetailLoading />}>
      <RecipeDetailPage />
    </Suspense>
  );
}
