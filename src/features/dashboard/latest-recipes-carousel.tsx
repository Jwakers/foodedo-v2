"use client";

import { useQuery } from "convex/react";

import { api } from "../../../convex/_generated/api";
import {
  RecipeCarousel,
  RecipeCarouselCard,
  RecipeCarouselList,
  RecipeCarouselItem,
} from "@/features/recipes/recipe-carousel";
import { catalogueBrowsePath } from "@/lib/routing/recipes";

export function LatestRecipesCarousel() {
  // The catalogue's default ordering is newest additions first, retaining
  // each recipe's original place when a new revision is published.
  const recipes = useQuery(api.catalogue.list, {
    paginationOpts: { numItems: 8, cursor: null },
  });

  return (
    <RecipeCarousel
      headingId="latest-recipes-heading"
      title="Latest recipes"
      href="/recipes"
      action="See all recipes"
    >
      {recipes === undefined ? (
        <p
          role="status"
          className="px-page-inline text-13 text-graphite sm:px-8"
        >
          Loading recipes…
        </p>
      ) : recipes.page.length === 0 ? (
        <p className="px-page-inline text-13 text-graphite sm:px-8">
          New recipes will appear here soon.
        </p>
      ) : (
        <RecipeCarouselList>
          {recipes.page.map((meal) => (
            <RecipeCarouselItem key={meal.id}>
              <RecipeCarouselCard
                meal={meal}
                title={meal.title}
                imageSrc={meal.imageSrc}
                href={catalogueBrowsePath(meal.slug)}
              />
            </RecipeCarouselItem>
          ))}
        </RecipeCarouselList>
      )}
    </RecipeCarousel>
  );
}
