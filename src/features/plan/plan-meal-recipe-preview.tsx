"use client";

import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DrawerBody, DrawerFooter } from "@/components/ui/drawer";
import { DrawerStackHeader } from "@/components/ui/drawer-stack-header";
import { RecipeDetailContent } from "@/features/recipes/recipe-detail-content";
import type { CatalogueMeal } from "@/lib/domain/recipes";

export function PlanMealRecipePreview({
  meal,
  isSwapping = false,
  onSwap,
}: {
  meal: CatalogueMeal;
  isSwapping?: boolean;
  onSwap: () => void;
}) {
  return (
    <>
      <DrawerStackHeader
        title="Recipe details"
        closeLabel="Close recipe details"
      />

      <DrawerBody className="flex min-h-0 flex-1 flex-col gap-0 overflow-y-auto px-0 pb-0">
        <RecipeDetailContent meal={meal} presentation="swapPreview" />
      </DrawerBody>

      <DrawerFooter>
        <Button
          className="w-full"
          disabled={isSwapping}
          aria-busy={isSwapping || undefined}
          onClick={onSwap}
        >
          <span className="truncate">Swap in {meal.title}</span>
          <ArrowRight aria-hidden="true" className="size-4.5 shrink-0" />
        </Button>
      </DrawerFooter>
    </>
  );
}
