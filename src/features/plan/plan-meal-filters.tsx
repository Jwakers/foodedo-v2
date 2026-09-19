"use client";

import { useDrawerStack } from "@/components/ui/drawer-stack";
import { DrawerStackHeader } from "@/components/ui/drawer-stack-header";
import { RecipeFilterPanel } from "@/features/recipes/recipe-filter-panel";
import { planMealDrawerViews } from "@/features/plan/plan-meal-drawer";
import {
  filterRecipes,
  type RecipeFilters,
  type RecipeSort,
} from "@/lib/domain/recipe-filtering";
import type { CatalogueMealSummary } from "@/lib/domain/recipes";

export function PlanMealFilters({
  meals,
  filters,
  sort,
  onApply,
}: {
  meals: ReadonlyArray<CatalogueMealSummary>;
  filters: RecipeFilters;
  sort: RecipeSort;
  onApply: (filters: RecipeFilters, sort: RecipeSort) => void;
}) {
  const { pop, push } = useDrawerStack();

  return (
    <>
      <DrawerStackHeader
        title="Filter recipes"
        closeLabel="Close recipe filters"
      />

      <RecipeFilterPanel
        filters={filters}
        sort={sort}
        onOpenSort={() => push(planMealDrawerViews.sort)}
        getMatchCount={(draftFilters) =>
          filterRecipes(meals, draftFilters).length
        }
        description="Only choose what would make this meal a better fit."
        onApply={(nextFilters) => {
          onApply(nextFilters, sort);
          pop();
        }}
      />
    </>
  );
}
