"use client";

import { useAuth } from "@clerk/react";
import { usePaginatedQuery } from "convex-helpers/react";
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

import { RecipesIntroduction } from "@/features/onboarding/contextual-introductions";
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
import { formatPersonalRecipeSourceLabel } from "@/lib/domain/recipe-display";
import type { CatalogueMealSummary } from "@/lib/domain/recipes";
import {
  type RecipeFilters,
  type RecipeSort,
} from "@/lib/domain/recipe-filtering";
import { catalogueBrowsePath } from "@/lib/routing/recipes";
import { cn } from "@/lib/utils/cn";
import { api } from "../../../convex/_generated/api";
import { useFoodedoAuth } from "@/features/auth/use-foodedo-auth";
import { personalRecipeDetailPath } from "@/lib/routing/recipes";

const pageSize = 20;
type CataloguePage = FunctionReturnType<typeof api.catalogue.list>;

const scopes = ["All", "Saved", "Yours"] as const;
type RecipeScope = (typeof scopes)[number];

const recipeDrawerViews = { filters: "filters", sort: "sort" } as const;

export function RecipesListing({
  initialPage,
}: {
  initialPage?: CataloguePage;
}) {
  const { isLoaded, isSignedIn } = useAuth();
  const { isAuthenticated } = useFoodedoAuth();
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

  // Saved / Yours need an account; a lone “All” tab is redundant for guests.
  const showScopes = Boolean(isLoaded && isSignedIn);
  const activeScope: RecipeScope = showScopes ? scope : "All";
  const catalogueQuery = usePaginatedQuery(
    api.catalogue.list,
    activeScope === "Yours" || (activeScope === "Saved" && !isAuthenticated)
      ? "skip"
      : {
          ...recipeFilters,
          proteinCategories: [...recipeFilters.proteinCategories],
          sort: recipeSort,
          searchQuery,
          savedOnly: activeScope === "Saved",
        },
    { initialNumItems: pageSize },
  );
  const personalRecipeQuery = usePaginatedQuery(
    api.recipes.listMine,
    isAuthenticated && activeScope === "Yours"
      ? {
          excludeCatalogue: true,
          ...recipeFilters,
          proteinCategories: [...recipeFilters.proteinCategories],
          sort: recipeSort,
          searchQuery,
        }
      : "skip",
    { initialNumItems: pageSize },
  );
  const useInitialPage =
    catalogueQuery.status === "LoadingFirstPage" &&
    activeScope === "All" &&
    !searchQuery &&
    !hasActiveRecipeFilters(recipeFilters) &&
    recipeSort === "recommended" &&
    initialPage !== undefined;
  const meals = useInitialPage ? initialPage.page : catalogueQuery.results;
  const catalogueIsLoading =
    catalogueQuery.status === "LoadingFirstPage" && !useInitialPage;
  const catalogueCanLoadMore = useInitialPage
    ? !initialPage.isDone
    : catalogueQuery.status === "CanLoadMore" ||
      catalogueQuery.status === "LoadingMore";
  const ownRecipes = personalRecipeQuery.results;
  const savedIsEmpty =
    activeScope === "Saved" &&
    !isLibraryLoading &&
    savedRecipeIdByMealId.size === 0;

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
          className="min-w-0 flex-1 bg-transparent text-16 text-ink outline-none placeholder:text-graphite"
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

      {activeScope === "All" ? <RecipesIntroduction /> : null}

      {activeScope === "All" ? (
        <CatalogueGrid
          heading="Ideas for you"
          countLabel={
            catalogueCanLoadMore
              ? `${recipeCountLabel(meals.length)} loaded`
              : recipeCountLabel(meals.length)
          }
          meals={meals}
          isLoading={catalogueIsLoading}
          canLoadMore={catalogueQuery.status === "CanLoadMore"}
          isLoadingMore={catalogueQuery.status === "LoadingMore"}
          onLoadMore={() => catalogueQuery.loadMore(pageSize)}
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
          countLabel={
            catalogueCanLoadMore
              ? `${recipeCountLabel(meals.length)} loaded`
              : recipeCountLabel(meals.length)
          }
          meals={meals}
          isLoading={catalogueIsLoading}
          canLoadMore={catalogueQuery.status === "CanLoadMore"}
          isLoadingMore={catalogueQuery.status === "LoadingMore"}
          onLoadMore={() => catalogueQuery.loadMore(pageSize)}
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
          onLoadMore={() => personalRecipeQuery.loadMore(pageSize)}
          filters={recipeFilters}
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
  onApply,
  onClose,
}: {
  filters: RecipeFilters;
  sort: RecipeSort;
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
        description="Narrow recipes to what you want to cook."
        onApply={(nextFilters) => {
          onApply(nextFilters);
          onClose();
        }}
      />
    </>
  );
}

function CatalogueGrid({
  heading,
  countLabel,
  meals,
  hasActiveFilters,
  isSaved,
  isSavePending,
  onToggleSave,
  isLoading,
  canLoadMore,
  isLoadingMore,
  onLoadMore,
}: {
  isLoading: boolean;
  canLoadMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
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

      {isLoading ? (
        <p className="py-16 text-center text-14 text-graphite" role="status">
          Loading recipes…
        </p>
      ) : meals.length === 0 ? (
        <SearchEmptyState
          hasActiveFilters={hasActiveFilters}
          hasMore={canLoadMore || isLoadingMore}
        />
      ) : (
        <ul className="mt-3.5 grid grid-cols-2 gap-x-4 gap-y-5">
          {meals.map((meal) => (
            <li key={meal.id}>
              <RecipeCard
                href={catalogueBrowsePath(meal.slug)}
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
      <LoadMoreButton
        canLoadMore={canLoadMore}
        isLoadingMore={isLoadingMore}
        onLoadMore={onLoadMore}
      />
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
  searchQuery,
}: {
  recipes: ReadonlyArray<PersonalRecipeView>;
  isLoading: boolean;
  canLoadMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  filters: RecipeFilters;
  searchQuery: string;
}) {
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
      ) : recipes.length === 0 &&
        !searchQuery &&
        !hasActiveRecipeFilters(filters) &&
        !canLoadMore &&
        !isLoadingMore ? (
        <EmptyYoursState />
      ) : recipes.length === 0 ? (
        <SearchEmptyState
          hasActiveFilters={hasActiveRecipeFilters(filters)}
          hasMore={canLoadMore || isLoadingMore}
        />
      ) : (
        <>
          <ul className="mt-3.5 grid grid-cols-2 gap-x-4 gap-y-5">
            {recipes.map((recipe) => (
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
        </>
      )}
      <LoadMoreButton
        canLoadMore={canLoadMore}
        isLoadingMore={isLoadingMore}
        onLoadMore={onLoadMore}
      />
    </section>
  );
}

function LoadMoreButton({
  canLoadMore,
  isLoadingMore,
  onLoadMore,
}: {
  canLoadMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
}) {
  if (!canLoadMore && !isLoadingMore) return null;
  return (
    <Button
      variant="secondary"
      className="mt-7 w-full"
      disabled={isLoadingMore}
      aria-busy={isLoadingMore}
      onClick={onLoadMore}
    >
      {isLoadingMore ? "Loading more…" : "Load more"}
    </Button>
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

function SearchEmptyState({
  hasActiveFilters,
  hasMore = false,
}: {
  hasActiveFilters: boolean;
  hasMore?: boolean;
}) {
  return (
    <p className="py-12 text-center text-14 text-graphite" role="status">
      {hasMore
        ? "No matches in this batch. Load more to keep looking."
        : hasActiveFilters
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
  const source = formatPersonalRecipeSourceLabel(recipe.source);
  if (recipe.reviewIssues.length > 0) {
    return (
      <>
        <span className="text-cadmium">Needs review</span>
        {source ? ` · ${source}` : null}
      </>
    );
  }
  const duration = formatMealDurationLabel(
    recipe.prepMinutes,
    recipe.cookMinutes,
  );
  return [source, duration].filter(Boolean).join(" · ");
}
