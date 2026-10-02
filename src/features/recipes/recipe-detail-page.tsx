"use client";

import { useMutation } from "convex/react";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { PlanThisMeal } from "@/features/plan/plan-this-meal";
import { RecipeDetailContent } from "@/features/recipes/recipe-detail-content";
import {
  useCatalogueMeal,
  useCurrentCatalogueMeal,
} from "@/features/recipes/use-catalogue";
import { Button } from "@/components/ui/button";
import {
  parsePersonalRecipeId,
  parseRecipeCatalogueReference,
} from "@/lib/routing/recipes";
import { parseRecipeServings } from "@/lib/routing/recipes";
import { useDefaultRecipeServings } from "@/features/recipes/use-default-recipe-servings";
import { usePersonalRecipe } from "@/features/recipes/use-personal-recipe";
import {
  buildRecipeRepairPatch,
  RecipeReviewDrawer,
} from "@/features/recipes/recipe-review-drawer";

export function RecipeDetailPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const slug = searchParams.get("slug")?.trim() || null;
  const personalRecipeId = parsePersonalRecipeId(searchParams);
  const reference = parseRecipeCatalogueReference(searchParams);
  const explicitServings = parseRecipeServings(searchParams.get("servings"));
  const { defaultServings, isLoading: isLoadingDefaultServings } =
    useDefaultRecipeServings(explicitServings !== null);
  const pinnedMeal = useCatalogueMeal(
    reference?.catalogueMealId ?? null,
    reference?.catalogueVersion ?? null,
  );
  const currentMeal = useCurrentCatalogueMeal(reference === null ? slug : null);
  const personalMeal = usePersonalRecipe(personalRecipeId);
  const repairImport = useMutation(api.recipes.repairImport);
  const [repairOpen, setRepairOpen] = useState(false);
  const [repairValues, setRepairValues] = useState<Record<string, string>>({});
  const catalogueMeal = reference === null ? currentMeal : pinnedMeal;
  const meal = personalRecipeId ? personalMeal : catalogueMeal;

  async function saveRepair() {
    if (!personalRecipeId || !personalMeal) return;
    const patch = buildRecipeRepairPatch(
      personalMeal.reviewIssues,
      repairValues,
    );
    if (patch === null) {
      toast.error(
        "Add servings and at least one known time using whole numbers.",
      );
      return;
    }
    try {
      await repairImport({
        recipeId: personalRecipeId as Id<"recipes">,
        ...patch,
      });
      setRepairOpen(false);
      setRepairValues({});
      toast.success("Recipe details saved.");
    } catch (error) {
      console.error("Failed to repair imported recipe.", error);
      toast.error("Foodedo couldn’t save those details.");
    }
  }

  useEffect(() => {
    if (meal) document.title = `${meal.title} · Foodedo`;
    return () => {
      document.title = "Foodedo";
    };
  }, [meal]);

  if ((slug === null && personalRecipeId === null) || meal === null) {
    return (
      <main className="mx-auto w-full max-w-175 px-page-inline py-16 text-center">
        <h1 className="font-display text-28 font-semibold text-ink">
          Recipe unavailable
        </h1>
        <p className="mt-2 text-14 text-graphite">
          This recipe could not be found in the current catalogue.
        </p>
        <Button className="mt-5" onClick={() => window.location.reload()}>
          Try again
        </Button>
      </main>
    );
  }

  if (meal === undefined || isLoadingDefaultServings) {
    return (
      <main className="mx-auto w-full max-w-175 px-page-inline py-16 text-center text-14 text-graphite">
        Loading recipe…
      </main>
    );
  }

  return (
    <div className="mx-auto w-full max-w-175">
      <RecipeDetailContent
        meal={meal}
        presentation="page"
        initialServings={
          explicitServings ??
          (personalRecipeId ? meal.servings : defaultServings)
        }
        personalRecipeId={personalRecipeId ?? undefined}
        reviewIssues={personalRecipeId ? personalMeal?.reviewIssues : undefined}
        onReview={personalRecipeId ? () => setRepairOpen(true) : undefined}
        source={personalRecipeId ? personalMeal?.source : undefined}
        ownerActions={
          personalRecipeId && personalMeal?.source.type === "import" ? (
            <Button
              variant="secondary"
              onClick={() =>
                router.push(`/recipes/edit?recipeId=${personalRecipeId}`)
              }
            >
              Edit recipe
            </Button>
          ) : undefined
        }
        planMealAction={
          personalRecipeId ? undefined : <PlanThisMeal meal={meal} />
        }
      />
      {personalRecipeId && personalMeal ? (
        <RecipeReviewDrawer
          open={repairOpen}
          issues={personalMeal.reviewIssues}
          values={repairValues}
          onValuesChange={setRepairValues}
          onOpenChange={setRepairOpen}
          onSave={() => void saveRepair()}
        />
      ) : null}
    </div>
  );
}
