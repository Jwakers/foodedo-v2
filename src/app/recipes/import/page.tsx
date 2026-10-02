import type { Metadata } from "next";
import { Suspense } from "react";

import { RecipeImporter } from "@/features/recipes/recipe-importer";

export const metadata: Metadata = {
  title: "Import a recipe · Foodedo",
  description: "Bring a recipe into your Foodedo collection.",
};

export default function RecipeImportPage() {
  return (
    <Suspense fallback={<main className="min-h-120 bg-paper" />}>
      <RecipeImporter />
    </Suspense>
  );
}
