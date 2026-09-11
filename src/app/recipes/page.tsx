import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { standardCatalogue } from "@/lib/domain/standard-catalogue";
import { recipeDetailPath } from "@/lib/routing/recipes";

export const metadata: Metadata = {
  title: "Recipes · Foodedo",
  description: "Browse Foodedo recipes and keep the ones you want to cook.",
};

export default function RecipesPage() {
  const meals = standardCatalogue.meals;

  return (
    <main className="mx-auto w-full max-w-175 px-page-inline py-8">
      <h1 className="font-display text-30 font-semibold tracking-title text-ink">
        Recipes
      </h1>
      <p className="mt-1 text-14 text-graphite">
        Temporary listing — tap through to a recipe detail.
      </p>

      <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {meals.map((meal) => (
          <li key={meal.id}>
            <Link
              href={recipeDetailPath(meal.slug)}
              className="flex h-full flex-col overflow-hidden rounded-sm bg-mist focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cadmium"
            >
              <div className="relative aspect-4/3 w-full bg-border">
                {meal.imageSrc ? (
                  <Image
                    src={meal.imageSrc}
                    alt=""
                    fill
                    sizes="(max-width: 640px) 50vw, 220px"
                    className="object-cover"
                  />
                ) : null}
              </div>
              <span className="px-2.5 py-2 text-13 font-semibold leading-4.5 text-ink">
                {meal.title}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
