"use client";

import Link from "next/link";

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
    <>
      <RecipeCarousel
        headingId="related-recipes-heading"
        title="More recipes to try"
        href="/recipes"
        action="Browse recipes"
        showSaveButton={false}
        className="border-t border-mist px-page-inline pt-6 pb-6 sm:px-8"
      >
        <RecipeCarouselList>
          {recipes.map((recipe) => {
            const totalMinutes =
              recipe.prepMinutes !== undefined ||
              recipe.cookMinutes !== undefined
                ? (recipe.prepMinutes ?? 0) + (recipe.cookMinutes ?? 0)
                : undefined;
            const servings =
              recipe.servings !== undefined
                ? `Serves ${recipe.servings}`
                : undefined;
            const meta =
              servings && totalMinutes !== undefined
                ? `${servings} · ${totalMinutes} min`
                : (servings ??
                  (totalMinutes !== undefined
                    ? `${totalMinutes} min`
                    : undefined));
            return (
              <RecipeCarouselItem key={recipe.id}>
                <RecipeCarouselCard
                  meal={recipe}
                  title={recipe.title}
                  imageSrc={recipe.imageSrc}
                  href={catalogueBrowsePath(recipe.slug)}
                  meta={meta}
                />
              </RecipeCarouselItem>
            );
          })}
        </RecipeCarouselList>
      </RecipeCarousel>
      {process.env.NEXT_PUBLIC_CAPACITOR_BUILD !== "true" && (
        <p className="px-page-inline pt-2 text-14 leading-6 text-graphite sm:px-8">
          Planning more than one?{" "}
          <Link
            href="/recipe-to-shopping-list"
            className="underline underline-offset-4 focus-visible:outline-cadmium"
          >
            See how three recipes become one shopping list
          </Link>
        </p>
      )}
    </>
  );
}
