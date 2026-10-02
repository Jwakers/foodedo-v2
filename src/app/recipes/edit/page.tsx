import type { Metadata } from "next";
import { Suspense } from "react";

import { ImportedRecipeEditor } from "@/features/recipes/imported-recipe-editor";

export const metadata: Metadata = {
  title: "Edit imported recipe · Foodedo",
};

export default function EditImportedRecipePage() {
  return (
    <Suspense
      fallback={
        <main className="px-page-inline py-16 text-center text-graphite">
          Loading recipe…
        </main>
      }
    >
      <ImportedRecipeEditor />
    </Suspense>
  );
}
