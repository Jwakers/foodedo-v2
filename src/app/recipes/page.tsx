import type { Metadata } from "next";
import { RecipeCatalogue } from "@/features/capture/recipe-catalogue";
import { SavedRecipeLibrary } from "@/features/capture/saved-recipe-library";

export const metadata: Metadata = {
  title: "Recipes · Foodedo",
  description: "Browse Foodedo recipes and keep the ones you want to cook.",
};

export default function RecipesPage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-5 pb-28 pt-12 sm:px-8 sm:pb-20 sm:pt-16 lg:px-12">
      <section aria-labelledby="recipes-heading">
        <p className="text-xs font-bold tracking-[0.18em] text-accent uppercase">
          Recipes
        </p>
        <div className="mt-4 grid gap-7 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-end">
          <h1
            id="recipes-heading"
            className="max-w-4xl font-display text-6xl leading-[0.9] tracking-[-0.055em] text-foreground sm:text-8xl"
          >
            Good food,
            <br />
            kept close.
          </h1>
          <p className="max-w-xl border-l-2 border-accent pl-5 text-base leading-7 text-muted-foreground">
            A working recipe book, not a graveyard of good intentions. Save what
            matters; Foodedo will bring it back into the plan.
          </p>
        </div>
      </section>

      <section
        aria-labelledby="saved-recipes-heading"
        className="mt-20 sm:mt-24"
      >
        <div className="mb-7 flex items-end justify-between gap-6 border-b border-foreground pb-5">
          <div>
            <p className="text-xs font-bold tracking-[0.18em] text-accent uppercase">
              Your library
            </p>
            <h2
              id="saved-recipes-heading"
              className="mt-2 font-display text-4xl tracking-[-0.035em] text-foreground sm:text-5xl"
            >
              My recipes
            </h2>
          </div>
        </div>
        <SavedRecipeLibrary />
      </section>

      <RecipeCatalogue />
    </main>
  );
}
