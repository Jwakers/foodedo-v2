"use client";

import { useAuth } from "@clerk/react";
import { Heart, ListFilter, Search, X } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useCatalogueRecipeLibrary } from "@/features/recipes/catalogue-recipe-library";
import { RecipeCard } from "@/features/recipes/recipe-card";
import { useCurrentCatalogue } from "@/features/recipes/use-catalogue";
import {
  RecipeFilterPanel,
  recipeQuickFilterLabels,
} from "@/features/recipes/recipe-filter-panel";
import {
  formatMealDurationLabel,
  formatProteinCategoryLabel,
} from "@/lib/domain/plan-display";
import type { CatalogueMealSummary } from "@/lib/domain/recipes";
import { recipeDetailPath } from "@/lib/routing/recipes";
import { markUnfinishedInteraction } from "@/lib/ui/unfinished-interaction";
import { cn } from "@/lib/utils/cn";

const scopes = ["All", "Saved", "Yours"] as const;
type RecipeScope = (typeof scopes)[number];

export function RecipesListing() {
  const catalogue = useCurrentCatalogue();
  const { isLoaded, isSignedIn } = useAuth();
  const {
    isLibraryLoading,
    isSaved,
    isSavePending,
    savedRecipeIdByMealId,
    toggleSave,
  } = useCatalogueRecipeLibrary();
  const [scope, setScope] = useState<RecipeScope>("All");
  const [filtersOpen, setFiltersOpen] = useState(false);

  if (catalogue === undefined) {
    return (
      <main className="mx-auto w-full max-w-175 px-page-inline py-16 text-center text-14 text-graphite">
        Loading recipes…
      </main>
    );
  }
  if (catalogue === null || catalogue.meals.length === 0) {
    return (
      <main className="mx-auto w-full max-w-175 px-page-inline py-16 text-center">
        <h1 className="font-display text-28 font-semibold text-ink">
          Recipes are unavailable
        </h1>
        <p className="mt-2 text-14 text-graphite">Please try again shortly.</p>
        <Button className="mt-5" onClick={() => window.location.reload()}>
          Try again
        </Button>
      </main>
    );
  }
  const meals = catalogue.meals;

  // Saved / Yours need an account; a lone “All” tab is redundant for guests.
  const showScopes = Boolean(isLoaded && isSignedIn);
  const activeScope: RecipeScope = showScopes ? scope : "All";
  const savedMeals = meals.filter((meal) => savedRecipeIdByMealId.has(meal.id));
  const savedIsEmpty =
    activeScope === "Saved" && !isLibraryLoading && savedMeals.length === 0;

  return (
    <main className="mx-auto w-full max-w-175 px-page-inline pt-6 pb-8">
      <header className="flex flex-col gap-1 pb-4.5">
        <h1 className="font-display text-34 font-semibold tracking-heading text-ink">
          Recipes
        </h1>
        <p className="text-14 leading-5 text-graphite">
          Saved favourites, your recipes and new ideas.
        </p>
      </header>

      <Button
        variant="search"
        aria-label="Search recipes"
        className="rounded-compact"
        onClick={() => {
          markUnfinishedInteraction("Recipe search comes next.");
        }}
      >
        <Search
          aria-hidden="true"
          className="size-5 shrink-0 text-graphite"
          strokeWidth={1.8}
        />
        <span className="text-15 text-graphite">Search recipes</span>
      </Button>

      {showScopes ? (
        <div
          className="flex items-center gap-1 pt-3"
          role="group"
          aria-label="Recipe scopes"
        >
          {scopes.map((label) => {
            return (
              <Button
                key={label}
                variant="choice"
                aria-pressed={activeScope === label}
                className="h-9 border-transparent px-4.5 text-14 text-graphite aria-pressed:border-transparent"
                onClick={() => setScope(label)}
              >
                {label}
              </Button>
            );
          })}
        </div>
      ) : null}

      {!savedIsEmpty ? (
        <div
          className={cn(
            "flex items-center gap-2 pb-1",
            showScopes ? "pt-2" : "pt-3",
          )}
        >
          <Button
            variant="filter"
            className="gap-1.75 border-ink px-3.25 font-semibold"
            onClick={() => setFiltersOpen(true)}
          >
            <ListFilter
              aria-hidden="true"
              className="size-4"
              strokeWidth={1.8}
            />
            Filter
          </Button>
          <div className="scrollbar-none -mr-page-inline flex min-w-0 flex-1 gap-2 overflow-x-auto pr-page-inline">
            {recipeQuickFilterLabels.map((label) => (
              <Button
                key={label}
                variant="filter"
                onClick={() => setFiltersOpen(true)}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      {activeScope === "All" ? (
        <CatalogueGrid
          heading="Ideas for you"
          countLabel={recipeCountLabel(meals.length)}
          meals={meals}
          isSaved={isSaved}
          isSavePending={isSavePending}
          onToggleSave={toggleSave}
        />
      ) : null}

      {activeScope === "Saved" && isLibraryLoading ? (
        <p className="py-16 text-center text-14 text-graphite" role="status">
          Loading saved recipes…
        </p>
      ) : null}

      {activeScope === "Saved" && savedIsEmpty ? (
        <EmptySavedState onBrowse={() => setScope("All")} />
      ) : null}

      {activeScope === "Saved" && !isLibraryLoading && !savedIsEmpty ? (
        <CatalogueGrid
          heading="Saved favourites"
          countLabel={`${savedMeals.length} saved`}
          meals={savedMeals}
          isSaved={isSaved}
          isSavePending={isSavePending}
          onToggleSave={toggleSave}
        />
      ) : null}

      {activeScope === "Yours" ? <YoursGrid imageFallbacks={meals} /> : null}

      <Drawer open={filtersOpen} onOpenChange={setFiltersOpen}>
        <DrawerContent className="max-h-[min(92dvh,52rem)]">
          <DrawerHeader className="items-center gap-2 pt-1">
            <DrawerTitle>Filter recipes</DrawerTitle>
            <DrawerClose asChild>
              <Button
                variant="ghost"
                size="headerIcon"
                aria-label="Close recipe filters"
              >
                <X aria-hidden="true" className="size-5" />
              </Button>
            </DrawerClose>
          </DrawerHeader>
          <RecipeFilterPanel
            matchCount={meals.length}
            description="Narrow recipes to what you want to cook."
            onApply={() => setFiltersOpen(false)}
          />
        </DrawerContent>
      </Drawer>
    </main>
  );
}

function CatalogueGrid({
  heading,
  countLabel,
  meals,
  isSaved,
  isSavePending,
  onToggleSave,
}: {
  heading: string;
  countLabel: string;
  meals: CatalogueMealSummary[];
  isSaved: (catalogueMealId: string) => boolean;
  isSavePending: (catalogueMealId: string) => boolean;
  onToggleSave: (args: {
    catalogueMealId: string;
    catalogueVersion: number;
    title: string;
  }) => Promise<unknown> | void;
}) {
  return (
    <section className="pt-2">
      <CollectionHeading heading={heading} trailing={countLabel} />

      <ul className="mt-3.5 grid grid-cols-2 gap-x-4 gap-y-5">
        {meals.map((meal) => (
          <li key={meal.id}>
            <RecipeCard
              href={recipeDetailPath(meal.slug)}
              title={meal.title}
              meta={catalogueMealMeta(meal)}
              imageSrc={meal.imageSrc}
              saved={isSaved(meal.id)}
              isSavePending={isSavePending(meal.id)}
              onToggleSave={() =>
                onToggleSave({
                  catalogueMealId: meal.id,
                  catalogueVersion: meal.version,
                  title: meal.title,
                })
              }
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function YoursGrid({
  imageFallbacks,
}: {
  imageFallbacks: CatalogueMealSummary[];
}) {
  const placeholders = yoursPlaceholders(imageFallbacks);

  return (
    <section className="pt-2">
      <CollectionHeading
        heading="Your recipes"
        trailing={
          <Button
            variant="inline"
            className="h-auto text-12 font-medium text-graphite hover:text-ink"
            onClick={() => {
              markUnfinishedInteraction("Importing recipes comes next.");
            }}
          >
            Import recipe →
          </Button>
        }
      />

      <ul className="mt-3.5 grid grid-cols-2 gap-x-4 gap-y-5">
        {placeholders.map((recipe) => (
          <li key={recipe.id}>
            <RecipeCard
              title={recipe.title}
              meta={recipe.meta}
              imageSrc={recipe.imageSrc}
              saved={recipe.saved}
              onToggleSave={() => {
                markUnfinishedInteraction(
                  "Saving your own recipes comes next.",
                );
              }}
              onOpen={() => {
                markUnfinishedInteraction(
                  `Opening “${recipe.title}” comes next — your recipes aren’t wired yet.`,
                );
              }}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function EmptySavedState({ onBrowse }: { onBrowse: () => void }) {
  return (
    <section className="flex flex-col items-center px-5 pt-18 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-cadmium-soft text-cadmium">
        <Heart aria-hidden="true" className="size-6" strokeWidth={1.8} />
      </span>
      <h2 className="mt-5 font-display text-24 font-semibold tracking-title text-ink">
        Nothing saved yet
      </h2>
      <p className="mt-2 max-w-65 text-14 leading-5 text-graphite">
        Save recipes you love and they&apos;ll be easy to find here.
      </p>
      <Button className="mt-6" onClick={onBrowse}>
        Browse Foodedo recipes
      </Button>
    </section>
  );
}

function CollectionHeading({
  heading,
  trailing,
}: {
  heading: string;
  trailing: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between pt-2">
      <h2 className="font-display text-24 font-semibold tracking-title text-ink">
        {heading}
      </h2>
      {typeof trailing === "string" ? (
        <p className="text-12 text-graphite">{trailing}</p>
      ) : (
        trailing
      )}
    </div>
  );
}

function catalogueMealMeta(meal: CatalogueMealSummary) {
  const duration = formatMealDurationLabel(meal.prepMinutes, meal.cookMinutes);
  const protein = formatProteinCategoryLabel(meal.proteinCategory);
  return [duration, protein].filter(Boolean).join(" · ");
}

function recipeCountLabel(count: number) {
  return `${count} ${count === 1 ? "recipe" : "recipes"}`;
}

/**
 * Light placeholder “Yours” cards — not real user recipes yet.
 * Images borrow catalogue assets by slug so paths don’t drift.
 */
function yoursPlaceholders(meals: CatalogueMealSummary[]) {
  const imageBySlug = (slug: string) =>
    meals.find((meal) => meal.slug === slug)?.imageSrc ?? null;

  return [
    {
      id: "yours-roast",
      title: "Sunday roast chicken",
      meta: "YOUR RECIPE · 1 hr 40 min",
      saved: true,
      imageSrc: imageBySlug("lemon-herb-grilled-chicken"),
    },
    {
      id: "yours-miso",
      title: "Miso aubergine noodles",
      meta: "IMPORTED · 25 min",
      saved: false,
      imageSrc: imageBySlug("thai-noodle-soup"),
    },
    {
      id: "yours-pasta",
      title: "Dad’s tomato pasta",
      meta: "YOUR RECIPE · 45 min",
      saved: false,
      imageSrc: null,
    },
    {
      id: "yours-salad",
      title: "Pear and walnut salad",
      meta: "IMPORTED · 15 min",
      saved: true,
      imageSrc: null,
    },
  ] as const;
}
