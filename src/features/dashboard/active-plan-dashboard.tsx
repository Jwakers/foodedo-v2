"use client";

import { allergyWarningText } from "@/features/allergies/allergy-warning";
import { useAllergies } from "@/features/allergies/allergy-context";
import { useEffect } from "react";
import { useAuth } from "@clerk/react";
import { rememberPlanVisit } from "@/lib/analytics";

import { useMemo } from "react";
import { ArrowRight, Check, Download, TriangleAlert } from "lucide-react";
import type { FunctionReturnType } from "convex/server";

import { ButtonLink } from "@/components/ui/button";
import { FeatureDiscovery } from "@/components/feature-discovery";
import { useHouseholdSpace } from "@/features/household/household-context";
import { PlanMealSelector } from "@/features/dashboard/plan-meal-selector";
import { MealsYouMightLike } from "@/features/dashboard/meals-you-might-like";
import { LatestRecipesCarousel } from "@/features/dashboard/latest-recipes-carousel";
import { readablePlanMeals, nextPlanTiming } from "@/lib/domain/plan-display";
import { NextPlanPrompt } from "@/features/plan/next-plan-prompt";
import { planMealSelectionKey } from "@/lib/platform/plan-meal-selection-store";
import { api } from "../../../convex/_generated/api";

type ActiveMealPlan = NonNullable<
  FunctionReturnType<typeof api.mealPlans.getCurrent>
>;

export function ActivePlanDashboard({ plan }: { plan: ActiveMealPlan }) {
  const { userId } = useAuth();
  const { effectiveIds } = useAllergies();
  const affectedMeals = plan.mealSlots.filter(
    (meal) =>
      meal.isAvailable &&
      meal.status !== "skipped" &&
      allergyWarningText(meal, effectiveIds),
  );
  useEffect(() => {
    rememberPlanVisit(plan._id, userId);
  }, [plan._id, userId]);
  const { spaceKey } = useHouseholdSpace();
  const meals = useMemo(
    () => readablePlanMeals(plan.mealSlots),
    [plan.mealSlots],
  );
  const nextTiming = nextPlanTiming(plan);
  const nextPlanPrompt = nextTiming ? (
    <NextPlanPrompt plan={plan} timing={nextTiming}>
      <ButtonLink href="/week/setup?mode=next" className="w-full">
        Start next week
        <ArrowRight aria-hidden="true" className="size-4.5" />
      </ButtonLink>
    </NextPlanPrompt>
  ) : null;
  const selectionKey = planMealSelectionKey(spaceKey, plan._id);
  return (
    <section
      aria-labelledby="active-plan-heading"
      className="mx-auto flex w-full max-w-175 flex-col gap-5"
    >
      <h1 id="active-plan-heading" className="sr-only">
        Your plan
      </h1>

      {affectedMeals.length > 0 ? (
        <div className="flex items-start gap-2.5 rounded-surface bg-cadmium-soft p-3.5">
          <TriangleAlert
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-cadmium"
          />
          <div>
            <p className="text-14 font-semibold text-cadmium">
              {affectedMeals
                .slice(0, 2)
                .map(
                  (meal) =>
                    `${meal.title}: ${allergyWarningText(meal, effectiveIds)?.toLowerCase()}`,
                )
                .join(". ")}
              {affectedMeals.length > 2
                ? `. Check ${affectedMeals.length - 2} other meals in your plan too.`
                : "."}
            </p>
            <p className="mt-1 text-12 leading-4.5 text-graphite">
              Always check ingredients, product labels and cross-contact risks.
            </p>
          </div>
        </div>
      ) : null}
      {nextTiming !== "ending" ? nextPlanPrompt : null}
      {meals.length > 0 ? (
        <PlanMealSelector
          key={selectionKey}
          selectionKey={selectionKey}
          meals={meals}
          servings={plan.servings}
        />
      ) : (
        <EmptyPlanNotice />
      )}

      {nextTiming === "ending" ? nextPlanPrompt : null}

      <ShoppingListReady mealCount={plan.mealSlots.length} />
      <LatestRecipesCarousel />
      <MealsYouMightLike hasSavedPlan />
      <ImportRecipeNudge />
    </section>
  );
}

function EmptyPlanNotice() {
  return (
    <div className="rounded-surface bg-mist p-4">
      <p className="font-display text-22 font-semibold text-ink">
        Your plan’s recipes are unavailable
      </p>
      <p className="mt-1 text-14 text-graphite">
        Open your plan to review its meals or choose replacements.
      </p>
      <ButtonLink href="/week" className="mt-3 w-full">
        View plan
        <ArrowRight aria-hidden="true" className="size-4.5" />
      </ButtonLink>
    </div>
  );
}

function ShoppingListReady({ mealCount }: { mealCount: number }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-surface bg-leaf-soft px-3.5 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-leaf text-leaf-soft">
          <Check aria-hidden="true" className="size-4" strokeWidth={2.4} />
        </div>
        <div className="min-w-0">
          <p className="text-14 font-bold text-ink">Shopping list ready</p>
          <p className="text-12 text-graphite">
            Built from {mealCount} planned {mealCount === 1 ? "meal" : "meals"}
          </p>
        </div>
      </div>
      <ButtonLink href="/shop" variant="inline" className="shrink-0 text-leaf">
        View list
        <ArrowRight aria-hidden="true" className="size-3.5" />
      </ButtonLink>
    </div>
  );
}

function ImportRecipeNudge() {
  return (
    <FeatureDiscovery
      headingId="import-discovery-heading"
      href="/recipes/import"
      ariaLabel="Import a recipe into Foodedo"
      label="Found a recipe elsewhere?"
      title="Bring it into Foodedo"
      action="Import a recipe"
      icon={<Download className="size-6" strokeWidth={1.8} />}
      tone="cadmium"
    />
  );
}
