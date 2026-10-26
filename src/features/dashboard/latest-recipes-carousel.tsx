"use client";

import { useQuery } from "convex/react";

import { api } from "../../../convex/_generated/api";
import {
  DashboardCarousel,
  DashboardCarouselCard,
  DashboardCarouselList,
} from "@/features/dashboard/dashboard-carousel";
import { recipeDetailPath } from "@/lib/routing/recipes";

export function LatestRecipesCarousel() {
  // The catalogue's default ordering is newest additions first, retaining
  // each recipe's original place when a new revision is published.
  const recipes = useQuery(api.catalogue.list, {
    paginationOpts: { numItems: 8, cursor: null },
  });

  return (
    <DashboardCarousel
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
        <DashboardCarouselList>
          {recipes.page.map((meal) => (
            <li key={meal.id} className="w-[111px] shrink-0 snap-start">
              <DashboardCarouselCard
                title={meal.title}
                imageSrc={meal.imageSrc}
                href={recipeDetailPath(meal.slug)}
              />
            </li>
          ))}
        </DashboardCarouselList>
      )}
    </DashboardCarousel>
  );
}
