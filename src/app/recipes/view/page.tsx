import type { Metadata } from "next";
import { Suspense } from "react";

import { RecipeDetailPage } from "@/features/recipes/recipe-detail-page";

export const metadata: Metadata = {
  title: "Recipe · Foodedo",
  description: "Ingredients and method for a Foodedo recipe.",
};

export default function RecipeViewPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto w-full max-w-175 px-page-inline py-16 text-center text-14 text-graphite">
          Loading recipe…
        </main>
      }
    >
      <RecipeDetailPage />
    </Suspense>
  );
}
