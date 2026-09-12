"use client";

import { useAuth } from "@clerk/react";
import { ListFilter, Search, X } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { RecipeCard } from "@/features/recipes/recipe-card";
import {
  RecipeFilterPanel,
  recipeQuickFilterLabels,
} from "@/features/recipes/recipe-filter-panel";
import {
  formatMealDurationLabel,
  formatProteinCategoryLabel,
} from "@/lib/domain/plan-display";
import type { CatalogueMeal } from "@/lib/domain/recipes";
import { recipeDetailPath } from "@/lib/routing/recipes";
import { temporaryFeedback } from "@/lib/ui/temporary-feedback";
import { cn } from "@/lib/utils/cn";

const scopes = ["All", "Saved", "Yours"] as const;
type RecipeScope = (typeof scopes)[number];

/** Temporary Saved-tab stand-ins until persistence exists. */
const SAVED_PLACEHOLDER_COUNT = 6;
/** How many “All” cards look saved for signed-in design fidelity. */
const ALL_SAVED_PREVIEW_COUNT = 3;

const emptySavedIds: ReadonlySet<string> = new Set();

export function RecipesListing({ meals }: { meals: CatalogueMeal[] }) {
  const { isLoaded, isSignedIn } = useAuth();
  const [scope, setScope] = useState<RecipeScope>("All");
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Saved / Yours need an account; a lone “All” tab is redundant for guests.
  const showScopes = Boolean(isLoaded && isSignedIn);
  const activeScope: RecipeScope = showScopes ? scope : "All";
  const savedPlaceholders = meals.slice(0, SAVED_PLACEHOLDER_COUNT);
  const allSavedPreviewIds = showScopes
    ? new Set(
        savedPlaceholders
          .slice(0, ALL_SAVED_PREVIEW_COUNT)
          .map((meal) => meal.id),
      )
    : emptySavedIds;

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

      <button
        type="button"
        aria-label="Search recipes"
        className="flex h-12 w-full items-center gap-2.5 rounded-compact bg-mist px-3.5 text-left transition-colors hover:bg-border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cadmium"
        onClick={() => {
          temporaryFeedback("Recipe search comes next.");
        }}
      >
        <Search
          aria-hidden="true"
          className="size-5 shrink-0 text-graphite"
          strokeWidth={1.8}
        />
        <span className="text-15 text-graphite">Search recipes</span>
      </button>

      {showScopes ? (
        <div
          className="flex items-center gap-1 pt-3"
          role="group"
          aria-label="Recipe scopes"
        >
          {scopes.map((label) => {
            const active = activeScope === label;
            return (
              <button
                key={label}
                type="button"
                aria-pressed={active}
                className={cn(
                  "flex h-9 items-center justify-center rounded-full px-4.5 text-14 font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cadmium",
                  active ? "bg-ink text-paper" : "text-graphite hover:bg-mist",
                )}
                onClick={() => setScope(label)}
              >
                {label}
              </button>
            );
          })}
        </div>
      ) : null}

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
          <ListFilter aria-hidden="true" className="size-4" strokeWidth={1.8} />
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

      {activeScope === "All" ? (
        <CatalogueGrid
          heading="Ideas for you"
          countLabel={recipeCountLabel(meals.length)}
          meals={meals}
          savedIds={allSavedPreviewIds}
          canSave={showScopes}
        />
      ) : null}

      {activeScope === "Saved" ? (
        <CatalogueGrid
          heading="Saved favourites"
          countLabel={`${savedPlaceholders.length} saved`}
          meals={savedPlaceholders}
          savedIds={new Set(savedPlaceholders.map((meal) => meal.id))}
          canSave
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
  savedIds,
  canSave,
}: {
  heading: string;
  countLabel: string;
  meals: CatalogueMeal[];
  savedIds: ReadonlySet<string>;
  canSave: boolean;
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
              saved={savedIds.has(meal.id)}
              canSave={canSave}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function YoursGrid({ imageFallbacks }: { imageFallbacks: CatalogueMeal[] }) {
  const placeholders = yoursPlaceholders(imageFallbacks);

  return (
    <section className="pt-2">
      <CollectionHeading
        heading="Your recipes"
        trailing={
          <button
            type="button"
            className="text-12 font-medium text-graphite transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cadmium"
            onClick={() => {
              temporaryFeedback("Importing recipes comes next.");
            }}
          >
            Import recipe →
          </button>
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
              canSave
              onOpen={() => {
                temporaryFeedback(
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

function catalogueMealMeta(meal: CatalogueMeal) {
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
function yoursPlaceholders(meals: CatalogueMeal[]) {
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
