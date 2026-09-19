"use client";

import {
  ArrowRight,
  Check,
  ChevronRight,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import Image from "next/image";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { DrawerBody, DrawerFooter } from "@/components/ui/drawer";
import { useDrawerStack } from "@/components/ui/drawer-stack";
import { DrawerStackHeader } from "@/components/ui/drawer-stack-header";
import { planMealDrawerViews } from "@/features/plan/plan-meal-drawer";
import { useCurrentCatalogue } from "@/features/recipes/use-catalogue";
import {
  isQuickFilterActive,
  toggleRecipeQuickFilter,
} from "@/features/recipes/use-recipe-filters";
import {
  formatMealDurationLabel,
  formatPlanWeekdayLong,
  formatPlanWeekdayShort,
  formatProteinCategoryLabel,
} from "@/lib/domain/plan-display";
import type { CatalogueMealSummary } from "@/lib/domain/recipes";
import {
  emptyRecipeFilters,
  filterRecipes,
  sortRecipes,
  type RecipeFilters,
  type RecipeSort,
} from "@/lib/domain/recipe-filtering";
import { filterCatalogueMealsBySearch } from "@/lib/domain/recipe-search";
import { cn } from "@/lib/utils/cn";

const quickFilterLabels = [
  "All",
  "Under 30 min",
  "Vegetarian",
  "Budget friendly",
] as const;

export function PlanMealSwap({
  date,
  currentMeal,
  isSwapping = false,
  filters = emptyRecipeFilters,
  sort = "recommended",
  onFiltersChange,
  onSwap,
  onOpenPreview,
}: {
  date: string;
  currentMeal?: CatalogueMealSummary;
  isSwapping?: boolean;
  filters?: RecipeFilters;
  sort?: RecipeSort;
  onFiltersChange?: (filters: RecipeFilters) => void;
  onSwap: (catalogueMealId: string) => Promise<unknown> | void;
  onOpenPreview: (catalogueMealId: string) => void;
}) {
  const { push } = useDrawerStack();
  const catalogue = useCurrentCatalogue();
  const candidates = (catalogue?.meals ?? []).filter(
    (meal) => meal.id !== currentMeal?.id,
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const filteredCandidates = filterRecipes(candidates, filters);
  const matchingCandidates = sortRecipes(
    filterCatalogueMealsBySearch(filteredCandidates, searchQuery),
    sort,
  );
  const selectedMeal =
    matchingCandidates.find((meal) => meal.id === selectedId) ?? null;

  function updateSearchQuery(query: string) {
    setSearchQuery(query);
    setSelectedId(null);
  }

  function updateFilters(nextFilters: RecipeFilters) {
    onFiltersChange?.(nextFilters);
    setSelectedId(null);
  }

  const weekdayLong = formatPlanWeekdayLong(date);
  const weekdayShort = formatPlanWeekdayShort(date);

  return (
    <>
      <DrawerStackHeader
        title={
          currentMeal
            ? `Swap ${weekdayLong}’s meal`
            : `Choose ${weekdayLong}’s meal`
        }
        description="Choose a better fit for your week"
        closeLabel="Close recipe picker"
      />

      <DrawerBody className="flex min-h-0 flex-1 flex-col gap-0 pb-4">
        {currentMeal ? (
          <div className="flex shrink-0 items-center gap-3 pb-4">
            <div className="relative h-12.5 w-14.5 shrink-0 overflow-hidden rounded-sm bg-mist">
              {currentMeal.imageSrc ? (
                <Image
                  src={currentMeal.imageSrc}
                  alt=""
                  fill
                  sizes="58px"
                  className="object-cover"
                />
              ) : null}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <p className="text-12 font-semibold tracking-label text-cadmium uppercase">
                Replacing
              </p>
              <p className="truncate text-15 font-semibold text-ink">
                {currentMeal.title}
              </p>
            </div>
            <span className="shrink-0 text-13 text-graphite">
              {weekdayShort}
            </span>
          </div>
        ) : null}

        <div className="flex h-12 w-full shrink-0 items-center gap-2.5 rounded-md bg-mist px-3.5 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-cadmium">
          <Search
            aria-hidden="true"
            className="size-5 shrink-0 text-graphite"
            strokeWidth={2}
          />
          <input
            type="text"
            inputMode="search"
            enterKeyHint="search"
            value={searchQuery}
            onChange={(event) => updateSearchQuery(event.target.value)}
            placeholder="Search recipes"
            aria-label="Search recipes"
            className="min-w-0 flex-1 bg-transparent text-15 text-ink outline-none placeholder:text-graphite"
          />
          {searchQuery ? (
            <button
              type="button"
              aria-label="Clear recipe search"
              className="-mr-2 flex size-8 shrink-0 items-center justify-center rounded-full text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cadmium"
              onClick={() => updateSearchQuery("")}
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          ) : null}
        </div>

        <div className="mt-3 mb-1 flex shrink-0 items-center gap-2 py-1">
          <Button
            variant="filter"
            size="filterIcon"
            aria-label="Open filters"
            onClick={() => push(planMealDrawerViews.filters)}
          >
            <SlidersHorizontal
              aria-hidden="true"
              className="size-4.5"
              strokeWidth={2}
            />
          </Button>
          <div className="scrollbar-none -mr-page-inline flex min-w-0 flex-1 gap-2 overflow-x-auto pr-page-inline">
            {quickFilterLabels.map((label) => {
              const active =
                label === "All"
                  ? !filters.under30Minutes &&
                    !filters.budgetFriendly &&
                    filters.proteinCategories.length === 0
                  : isQuickFilterActive(
                      filters,
                      label === "Vegetarian" ? "Meat-free" : label,
                    );
              return (
                <Button
                  key={label}
                  variant="filter"
                  aria-pressed={active}
                  onClick={() => {
                    if (label === "All") {
                      updateFilters(emptyRecipeFilters);
                      return;
                    }
                    updateFilters(
                      toggleRecipeQuickFilter(
                        filters,
                        label === "Vegetarian" ? "Meat-free" : label,
                      ),
                    );
                  }}
                >
                  {label}
                </Button>
              );
            })}
          </div>
        </div>

        <div className="flex shrink-0 items-end justify-between pt-3 pb-2">
          <h3 className="font-display text-20 font-semibold tracking-card text-ink">
            Good matches
          </h3>
          <p className="text-12 text-graphite">
            {matchingCandidates.length}{" "}
            {matchingCandidates.length === 1 ? "recipe" : "recipes"}
          </p>
        </div>

        <ul
          className="flex min-h-0 flex-1 flex-col"
          aria-label="Recipe matches"
        >
          {matchingCandidates.map((meal) => (
            <SwapCandidateRow
              key={meal.id}
              meal={meal}
              selected={meal.id === selectedId}
              disabled={isSwapping}
              onSelect={() => setSelectedId(meal.id)}
              onOpenPreview={() => onOpenPreview(meal.id)}
            />
          ))}
          {matchingCandidates.length === 0 ? (
            <li
              className="py-12 text-center text-14 text-graphite"
              role="status"
            >
              No recipes match your search.
            </li>
          ) : null}
        </ul>
      </DrawerBody>

      <DrawerFooter>
        <Button
          className="w-full"
          disabled={!selectedMeal || isSwapping}
          aria-busy={isSwapping || undefined}
          onClick={() => {
            if (!selectedMeal || isSwapping) return;
            void onSwap(selectedMeal.id);
          }}
        >
          <span className="truncate">
            {selectedMeal
              ? `${currentMeal ? "Swap in" : "Add"} ${selectedMeal.title}`
              : "Choose a recipe"}
          </span>
          <ArrowRight aria-hidden="true" className="size-4.5 shrink-0" />
        </Button>
      </DrawerFooter>
    </>
  );
}

function SwapCandidateRow({
  meal,
  selected,
  disabled,
  onSelect,
  onOpenPreview,
}: {
  meal: CatalogueMealSummary;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
  onOpenPreview: () => void;
}) {
  const durationLabel = formatMealDurationLabel(
    meal.prepMinutes,
    meal.cookMinutes,
  );
  const meta = [durationLabel, formatProteinCategoryLabel(meal.proteinCategory)]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="flex shrink-0 items-center gap-3 border-b border-border py-2.5">
      <button
        type="button"
        aria-label={`View ${meal.title}`}
        disabled={disabled}
        className="flex min-w-0 flex-1 items-center gap-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cadmium disabled:opacity-55"
        onClick={onOpenPreview}
      >
        <div className="relative h-17 w-20.5 shrink-0 overflow-hidden rounded-sm bg-mist">
          {meal.imageSrc ? (
            <Image
              src={meal.imageSrc}
              alt=""
              fill
              sizes="82px"
              className="object-cover"
            />
          ) : null}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-0.75">
          <p className="truncate text-15 font-semibold text-ink">
            {meal.title}
          </p>
          {meta ? (
            <span className="flex w-fit items-center gap-1 text-12 text-graphite">
              {meta}
              <ChevronRight
                aria-hidden="true"
                className="size-4 shrink-0"
                strokeWidth={1.8}
              />
            </span>
          ) : (
            <span className="flex w-fit items-center gap-1 text-12 text-graphite">
              View recipe
              <ChevronRight
                aria-hidden="true"
                className="size-4 shrink-0"
                strokeWidth={1.8}
              />
            </span>
          )}
        </div>
      </button>

      <button
        type="button"
        aria-pressed={selected}
        aria-label={`Select ${meal.title}`}
        disabled={disabled}
        className="flex size-11 shrink-0 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cadmium disabled:opacity-55"
        onClick={onSelect}
      >
        <span
          className={cn(
            "box-border flex size-6 items-center justify-center rounded-full border border-solid",
            selected
              ? "border-cadmium bg-cadmium text-paper"
              : "border-control-muted bg-transparent",
          )}
          aria-hidden="true"
        >
          {selected ? <Check className="size-3.5" strokeWidth={3} /> : null}
        </span>
      </button>
    </li>
  );
}
