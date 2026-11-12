"use client";

import { useCurrentCatalogue } from "./use-catalogue";
import {
  RecipeCarousel,
  RecipeCarouselCard,
  RecipeCarouselItem,
  RecipeCarouselList,
} from "./recipe-carousel";
import type { CatalogueMealSummary } from "@/lib/domain/recipes";
import { selectRelatedRecipes } from "@/lib/domain/related-recipes";
import { catalogueBrowsePath } from "@/lib/routing/recipes";

export function LiveRelatedRecipes({ meal }: { meal: CatalogueMealSummary }) {
  const catalogue = useCurrentCatalogue();
  return (
    <RelatedRecipesCarousel
      recipes={selectRelatedRecipes(meal, catalogue?.meals ?? [])}
    />
  );
}

export function RelatedRecipesCarousel({
  recipes,
}: {
  recipes: CatalogueMealSummary[];
}) {
  if (recipes.length === 0) return null;

  return (
    <RecipeCarousel
      headingId="related-recipes-heading"
      title="More recipes to try"
      href="/recipes"
      action="Browse recipes"
      showSaveButton={false}
      className="border-t border-mist px-page-inline pt-6 pb-8 sm:px-8"
    >
      <RecipeCarouselList>
        {recipes.map((recipe) => (
          <RecipeCarouselItem key={recipe.id}>
            <RecipeCarouselCard
              meal={recipe}
              title={recipe.title}
              imageSrc={recipe.imageSrc}
              href={catalogueBrowsePath(recipe.slug)}
              meta={
                recipe.prepMinutes !== undefined ||
                recipe.cookMinutes !== undefined
                  ? `${(recipe.prepMinutes ?? 0) + (recipe.cookMinutes ?? 0)} min`
                  : undefined
              }
            />
          </RecipeCarouselItem>
        ))}
      </RecipeCarouselList>
    </RecipeCarousel>
  );
}
