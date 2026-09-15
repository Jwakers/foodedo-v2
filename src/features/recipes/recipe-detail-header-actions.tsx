"use client";

import { Heart } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useCatalogueRecipeLibrary } from "@/features/recipes/catalogue-recipe-library";
import { RecipeOverflowMenu } from "@/features/recipes/recipe-overflow-menu";
import type { CatalogueMeal } from "@/lib/domain/recipes";
import { cn } from "@/lib/utils/cn";

export function RecipeDetailHeaderActions({
  recipe,
}: {
  recipe: CatalogueMeal;
}) {
  const { isSaved, isSavePending, toggleSave } = useCatalogueRecipeLibrary();
  const saved = isSaved(recipe.id);
  const pending = isSavePending(recipe.id);

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="headerIcon"
        aria-label={saved ? `Unsave ${recipe.title}` : `Save ${recipe.title}`}
        aria-pressed={saved}
        aria-busy={pending || undefined}
        disabled={pending}
        className={cn(
          saved && "bg-cadmium-soft text-cadmium hover:bg-cadmium-soft",
        )}
        onClick={() => {
          void toggleSave({
            catalogueMealId: recipe.id,
            title: recipe.title,
          });
        }}
      >
        <Heart
          aria-hidden="true"
          className={cn("size-5", saved && "fill-current")}
          strokeWidth={1.8}
        />
      </Button>
      <RecipeOverflowMenu recipeTitle={recipe.title} />
    </>
  );
}
