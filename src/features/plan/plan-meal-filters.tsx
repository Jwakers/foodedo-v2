"use client";

import { useDrawerStack } from "@/components/ui/drawer-stack";
import { DrawerStackHeader } from "@/components/ui/drawer-stack-header";
import { RecipeFilterPanel } from "@/features/recipes/recipe-filter-panel";

export function PlanMealFilters({ matchCount }: { matchCount: number }) {
  const { pop } = useDrawerStack();

  return (
    <>
      <DrawerStackHeader
        title="Filter recipes"
        closeLabel="Close recipe filters"
      />

      <RecipeFilterPanel
        matchCount={matchCount}
        description="Only choose what would make this meal a better fit."
        onApply={() => pop()}
      />
    </>
  );
}
