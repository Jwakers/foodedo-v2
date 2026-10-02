"use client";

import { useAuth } from "@clerk/react";
import { usePaginatedQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  ArrowRight,
  Download,
  Heart,
  ListFilter,
  Search,
  X,
} from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";

import { Button, ButtonLink } from "@/components/ui/button";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import {
  DrawerStack,
  DrawerStackView,
  useDrawerStack,
} from "@/components/ui/drawer-stack";
import { DrawerStackHeader } from "@/components/ui/drawer-stack-header";
import { useCatalogueRecipeLibrary } from "@/features/recipes/catalogue-recipe-library";
import { RecipeCard } from "@/features/recipes/recipe-card";
import { useCurrentCatalogue } from "@/features/recipes/use-catalogue";
import { RecipeFilterPanel } from "@/features/recipes/recipe-filter-panel";
import { RecipeSortStackPane } from "@/features/recipes/recipe-sort-stack-pane";
import {
  recipeQuickFilterLabels,
  useRecipeFilters,
} from "@/features/recipes/use-recipe-filters";
import {
  formatMealDurationLabel,
  formatProteinCategoryLabel,
} from "@/lib/domain/plan-display";
import type { CatalogueMealSummary } from "@/lib/domain/recipes";
import {
  filterRecipes,
  sortRecipes,
  type RecipeFilters,
  type RecipeSort,
} from "@/lib/domain/recipe-filtering";
import { filterCatalogueMealsBySearch } from "@/lib/domain/recipe-search";
import { recipeDetailPath } from "@/lib/routing/recipes";
import { cn } from "@/lib/utils/cn";
import { api } from "../../../convex/_generated/api";
import { useFoodedoAuth } from "@/features/auth/use-foodedo-auth";
import { personalRecipeDetailPath } from "@/lib/routing/recipes";

const scopes = ["All", "Saved", "Yours"] as const;
type RecipeScope = (typeof scopes)[number];

const recipeDrawerViews = { filters: "filters", sort: "sort" } as const;

export function RecipesListing() {
  const catalogue = useCurrentCatalogue();
  const { isLoaded, isSignedIn } = useAuth();
  const { isAuthenticated } = useFoodedoAuth();
  const personalRecipeQuery = usePaginatedQuery(
    api.recipes.listMine,
    isAuthenticated ? {} : "skip",
    { initialNumItems: 50 },
  );
  const {
    isLibraryLoading,
    isSaved,
    isSavePending,
    savedRecipeIdByMealId,
    toggleSave,
  } = useCatalogueRecipeLibrary();
  const [scope, setScope] = useState<RecipeScope>("All");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterStackKey, setFilterStackKey] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const {
    filters: recipeFilters,
    sort: recipeSort,
    setFilters: setRecipeFilters,
    setSort: setRecipeSort,
    isQuickFilterActive,
    toggleQuickFilter,
  } = useRecipeFilters();

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
  const ownRecipes = personalRecipeQuery.results.filter(
    (recipe) => recipe.source.type !== "catalogue",
  );

  // Saved / Yours need an account; a lone “All” tab is redundant for guests.
  const showScopes = Boolean(isLoaded && isSignedIn);
  const activeScope: RecipeScope = showScopes ? scope : "All";
  const savedMeals = meals.filter((meal) => savedRecipeIdByMealId.has(meal.id));
  const filteredMeals = filterRecipes(meals, recipeFilters);
  const filteredSavedMeals = filterRecipes(savedMeals, recipeFilters);
  const matchingMeals = sortRecipes(
    filterCatalogueMealsBySearch(filteredMeals, searchQuery),
    recipeSort,
  );
  const matchingSavedMeals = sortRecipes(
    filterCatalogueMealsBySearch(filteredSavedMeals, searchQuery),
    recipeSort,
  );
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

      <div className="flex h-12 w-full items-center gap-2.5 rounded-compact bg-mist px-3.5 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-cadmium">
        <Search
          aria-hidden="true"
          className="size-5 shrink-0 text-graphite"
          strokeWidth={1.8}
        />
        <input
          type="text"
          inputMode="search"
          enterKeyHint="search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search recipes"
          aria-label="Search recipes"
          className="min-w-0 flex-1 bg-transparent text-15 text-ink outline-none placeholder:text-graphite"
        />
        {searchQuery ? (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Clear recipe search"
            className="-mr-2 h-8 w-8 rounded-full p-0"
            onClick={() => setSearchQuery("")}
          >
            <X aria-hidden="true" className="size-4" />
          </Button>
        ) : null}
      </div>

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
                aria-pressed={isQuickFilterActive(recipeFilters, label)}
                onClick={() => toggleQuickFilter(label)}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      {activeScope === "All" ? <RecipeImportDiscoveryLink /> : null}

      {activeScope === "All" ? (
        <CatalogueGrid
          heading="Ideas for you"
          countLabel={recipeCountLabel(matchingMeals.length)}
          meals={matchingMeals}
          hasActiveFilters={hasActiveRecipeFilters(recipeFilters)}
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
          countLabel={`${matchingSavedMeals.length} saved`}
          meals={matchingSavedMeals}
          hasActiveFilters={hasActiveRecipeFilters(recipeFilters)}
          isSaved={isSaved}
          isSavePending={isSavePending}
          onToggleSave={toggleSave}
        />
      ) : null}

      {activeScope === "Yours" ? (
        <YoursGrid
          recipes={ownRecipes}
          isLoading={personalRecipeQuery.status === "LoadingFirstPage"}
          canLoadMore={personalRecipeQuery.status === "CanLoadMore"}
          isLoadingMore={personalRecipeQuery.status === "LoadingMore"}
          onLoadMore={() => personalRecipeQuery.loadMore(50)}
          filters={recipeFilters}
          sort={recipeSort}
          searchQuery={searchQuery}
        />
      ) : null}

      <Drawer
        open={filtersOpen}
        onOpenChange={(nextOpen) => {
          setFiltersOpen(nextOpen);
          if (!nextOpen) setFilterStackKey((current) => current + 1);
        }}
      >
        <DrawerContent className="max-h-[min(92dvh,52rem)]">
          <DrawerStack key={filterStackKey} rootId={recipeDrawerViews.filters}>
            <DrawerStackView id={recipeDrawerViews.filters} layout="hug">
              <RecipesFilterPane
                filters={recipeFilters}
                sort={recipeSort}
                meals={meals}
                savedMeals={savedMeals}
                ownRecipes={ownRecipes}
                activeScope={activeScope}
                searchQuery={searchQuery}
                onApply={setRecipeFilters}
                onClose={() => setFiltersOpen(false)}
              />
            </DrawerStackView>
            <DrawerStackView id={recipeDrawerViews.sort} layout="hug">
              <RecipeSortStackPane sort={recipeSort} onChange={setRecipeSort} />
            </DrawerStackView>
          </DrawerStack>
        </DrawerContent>
      </Drawer>
    </main>
  );
}

function RecipeImportDiscoveryLink() {
  return (
    <Link
      href="/recipes/import"
      className="group mt-2 flex min-h-20 items-center gap-3 rounded-surface bg-mist px-3.5 py-3.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cadmium"
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded-compact bg-cadmium-soft text-ink transition-colors group-hover:bg-border">
        <Download aria-hidden="true" className="size-5.5" strokeWidth={1.8} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-display text-18 font-semibold tracking-card text-ink">
          Bring your own recipe
        </span>
        <span className="text-13 text-graphite">
          Paste a link or recipe text
        </span>
      </span>
      <span className="flex size-11 shrink-0 items-center justify-center rounded-full text-ink transition-transform group-hover:translate-x-0.5">
        <ArrowRight aria-hidden="true" className="size-4.5" strokeWidth={1.8} />
      </span>
    </Link>
  );
}

function RecipesFilterPane({
  filters,
  sort,
  meals,
  savedMeals,
  ownRecipes,
  activeScope,
  searchQuery,
  onApply,
  onClose,
}: {
  filters: RecipeFilters;
  sort: RecipeSort;
  meals: ReadonlyArray<RecipeFilterSearchable>;
  savedMeals: ReadonlyArray<RecipeFilterSearchable>;
  ownRecipes: ReadonlyArray<PersonalRecipeView>;
  activeScope: RecipeScope;
  searchQuery: string;
  onApply: (filters: RecipeFilters) => void;
  onClose: () => void;
}) {
  const { push } = useDrawerStack();

  return (
    <>
      <DrawerStackHeader
        title="Filter recipes"
        closeLabel="Close recipe filters"
      />
      <RecipeFilterPanel
        filters={filters}
        sort={sort}
        onOpenSort={() => push(recipeDrawerViews.sort)}
        getMatchCount={(draftFilters) => {
          const matchingScopeMeals: ReadonlyArray<RecipeFilterSearchable> =
            activeScope === "Saved"
              ? filterRecipes(savedMeals, draftFilters)
              : activeScope === "Yours"
                ? filterRecipes(ownRecipes, draftFilters)
                : filterRecipes(meals, draftFilters);

          return filterCatalogueMealsBySearch(matchingScopeMeals, searchQuery)
            .length;
        }}
        description="Narrow recipes to what you want to cook."
        onApply={(nextFilters) => {
          onApply(nextFilters);
          onClose();
        }}
      />
    </>
  );
}

type RecipeFilterSearchable = {
  title: string;
  description?: string;
  prepMinutes?: number;
  cookMinutes?: number;
  proteinCategory: RecipeFilters["proteinCategories"][number];
  costBand?: "budget" | "standard" | "premium";
};

function CatalogueGrid({
  heading,
  countLabel,
  meals,
  hasActiveFilters,
  isSaved,
  isSavePending,
  onToggleSave,
}: {
  heading: string;
  countLabel: string;
  meals: ReadonlyArray<CatalogueMealSummary>;
  hasActiveFilters: boolean;
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

      {meals.length === 0 ? (
        <SearchEmptyState hasActiveFilters={hasActiveFilters} />
      ) : (
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
      )}
    </section>
  );
}

function YoursGrid({
  recipes,
  isLoading,
  canLoadMore,
  isLoadingMore,
  onLoadMore,
  filters,
  sort,
  searchQuery,
}: {
  recipes: ReadonlyArray<PersonalRecipeView>;
  isLoading: boolean;
  canLoadMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  filters: RecipeFilters;
  sort: RecipeSort;
  searchQuery: string;
}) {
  const matchingRecipes = sortRecipes(
    filterCatalogueMealsBySearch(filterRecipes(recipes, filters), searchQuery),
    sort,
  );

  return (
    <section className="pt-2">
      <CollectionHeading
        heading="Your recipes"
        trailing={
          <ButtonLink
            href="/recipes/import"
            variant="inline"
            className="h-auto text-12 font-medium text-graphite hover:text-ink"
          >
            Import recipe →
          </ButtonLink>
        }
      />

      {isLoading ? (
        <p className="py-16 text-center text-14 text-graphite" role="status">
          Loading your recipes…
        </p>
      ) : recipes.length === 0 && !searchQuery ? (
        <EmptyYoursState />
      ) : matchingRecipes.length === 0 ? (
        <SearchEmptyState hasActiveFilters={hasActiveRecipeFilters(filters)} />
      ) : (
        <>
          <ul className="mt-3.5 grid grid-cols-2 gap-x-4 gap-y-5">
            {matchingRecipes.map((recipe) => (
              <li key={recipe._id}>
                <RecipeCard
                  title={recipe.title}
                  meta={personalRecipeMeta(recipe)}
                  imageSrc={recipe.imageSrc}
                  saved
                  showSave={false}
                  onToggleSave={() => undefined}
                  href={personalRecipeDetailPath(recipe._id)}
                />
              </li>
            ))}
          </ul>
          {canLoadMore || isLoadingMore ? (
            <Button
              variant="secondary"
              className="mt-7 w-full"
              disabled={isLoadingMore}
              onClick={onLoadMore}
            >
              {isLoadingMore ? "Loading more…" : "Load more"}
            </Button>
          ) : null}
        </>
      )}
    </section>
  );
}

function EmptyYoursState() {
  return (
    <section className="flex flex-col items-center px-5 pt-14 text-center">
      <h2 className="font-display text-24 font-semibold tracking-title text-ink">
        Bring your first recipe
      </h2>
      <p className="mt-2 max-w-65 text-14 leading-5 text-graphite">
        Import a recipe link or paste the recipe text. Foodedo will organise it
        for you.
      </p>
      <ButtonLink href="/recipes/import" className="mt-6">
        Import recipe
      </ButtonLink>
    </section>
  );
}

function SearchEmptyState({ hasActiveFilters }: { hasActiveFilters: boolean }) {
  return (
    <p className="py-12 text-center text-14 text-graphite" role="status">
      {hasActiveFilters
        ? "No recipes match your search or filters."
        : "No recipes match your search."}
    </p>
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

function hasActiveRecipeFilters(filters: RecipeFilters) {
  return (
    filters.under30Minutes ||
    filters.budgetFriendly ||
    filters.proteinCategories.length > 0
  );
}

type PersonalRecipeView = FunctionReturnType<
  typeof api.recipes.listMine
>["page"][number];

function personalRecipeMeta(recipe: PersonalRecipeView) {
  const source = recipe.source.type === "import" ? "IMPORTED" : "YOUR RECIPE";
  if (recipe.reviewIssues.length > 0) return `NEEDS REVIEW · ${source}`;
  const duration = formatMealDurationLabel(
    recipe.prepMinutes,
    recipe.cookMinutes,
  );
  return [source, duration].filter(Boolean).join(" · ");
}
