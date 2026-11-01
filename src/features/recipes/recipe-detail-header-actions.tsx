"use client";

import { formatRecipeHeading } from "@/lib/domain/recipe-headings";
import { Heart, MoreVertical } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useCatalogueRecipeLibrary } from "@/features/recipes/catalogue-recipe-library";
import { RecipeOverflowMenu } from "@/features/recipes/recipe-overflow-menu";
import type { CatalogueMeal } from "@/lib/domain/recipes";
import { cn } from "@/lib/utils/cn";

export function RecipeDetailHeaderActions({
  recipe,
}: {
  recipe?: CatalogueMeal;
}) {
  const { isSaved, isSaveDisabled, toggleSave } = useCatalogueRecipeLibrary();
  const saved = recipe ? isSaved(recipe.id) : false;
  const title = recipe ? formatRecipeHeading(recipe.title) : "recipe";

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="headerIcon"
        aria-label={saved ? `Unsave ${title}` : `Save ${title}`}
        aria-pressed={saved}
        disabled={!recipe || isSaveDisabled}
        className={cn(
          saved && "bg-cadmium-soft text-cadmium hover:bg-cadmium-soft",
        )}
        onClick={() => {
          if (!recipe) return;
          void toggleSave({
            catalogueMealId: recipe.id,
            catalogueVersion: recipe.version,
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
      {recipe ? (
        <RecipeOverflowMenu
          recipeTitle={formatRecipeHeading(recipe.title)}
          recipeSlug={recipe.slug}
        />
      ) : (
        <Button
          variant="ghost"
          size="headerIcon"
          disabled
          aria-label="Recipe options"
        >
          <MoreVertical aria-hidden="true" className="size-5" />
        </Button>
      )}
    </>
  );
}
