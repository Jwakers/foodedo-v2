"use client";

import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { toast } from "sonner";
import { ChevronDown } from "lucide-react";
import { useMemo } from "react";

import { ContextSelector } from "@/features/household/context-selector";
import { SpaceHeader } from "@/components/space-header";
import { useHouseholdSpace } from "@/features/household/household-context";
import { ButtonLink } from "@/components/ui/button";
import { Button } from "@/components/ui/button";
import { ActivePlanAdjustDrawer } from "@/features/plan/active-plan-adjust-drawer";
import { PlanMealRow } from "@/features/plan/plan-meal-row";
import {
  formatGuestPlanSummary,
  formatPlanDateRange,
  isNearActivePlanEnd,
  resolveActivePlanWeekRows,
} from "@/lib/domain/plan-display";
import {
  useCatalogueMeals,
  useCurrentCatalogue,
} from "@/features/recipes/use-catalogue";
import {
  personalRecipeDetailPath,
  recipeDetailPath,
} from "@/lib/routing/recipes";
import { catalogueMealReferenceKey } from "@/lib/domain/recipes";
import { cn } from "@/lib/utils/cn";

export type ActiveWeekPlan = {
  _id: string;
  startDate: string;
  endDate: string;
  servings: number;
  updatedAt: number;
  status: "active" | "archived";
  mealSlots: ReadonlyArray<{
    date: string;
    recipeId?: string;
    slotId?: string;
    status: "planned" | "cooked" | "skipped";
    title: string;
    description: string | null;
    imageSrc: string | null;
    catalogueMealId: string | null;
    catalogueVersion: number | null;
    catalogueMealSlug: string | null;
    prepMinutes: number | null;
    cookMinutes: number | null;
  }>;
};

export type ActiveWeekPlanSummary = Pick<
  ActiveWeekPlan,
  "_id" | "startDate" | "endDate" | "status"
>;

export function ActiveWeek({
  plan,
  plans,
  onSelectPlan,
  onReplan,
  isReplanning,
  onStartNextPlan,
  isStartingNextPlan,
}: {
  plan: ActiveWeekPlan;
  plans: ReadonlyArray<ActiveWeekPlanSummary>;
  onSelectPlan: (mealPlanId: string) => void;
  onReplan: () => void | Promise<void>;
  isReplanning: boolean;
  onStartNextPlan: () => void | Promise<void>;
  isStartingNextPlan: boolean;
}) {
  const { isHousehold, household, spaceArgs } = useHouseholdSpace();
  const catalogue = useCurrentCatalogue();
  const putMeal = useMutation(api.mealPlans.planMeal);
  const removeMeal = useMutation(api.mealPlans.removeMeal);
  const swapMeal = useMutation(api.mealPlans.swapMeal);
  const pinnedReferences = useMemo(() => {
    const references = new Map<
      string,
      { catalogueMealId: string; catalogueVersion: number }
    >();
    for (const slot of plan.mealSlots) {
      if (
        slot.catalogueMealId === null ||
        slot.catalogueVersion === null ||
        !Number.isInteger(slot.catalogueVersion) ||
        slot.catalogueVersion < 1
      ) {
        continue;
      }
      references.set(
        catalogueMealReferenceKey({
          catalogueMealId: slot.catalogueMealId,
          catalogueVersion: slot.catalogueVersion,
        }),
        {
          catalogueMealId: slot.catalogueMealId,
          catalogueVersion: slot.catalogueVersion,
        },
      );
    }
    return [...references.values()];
  }, [plan.mealSlots]);
  const pinnedMeals = useCatalogueMeals(
    pinnedReferences.length > 0 ? pinnedReferences : null,
  );
  const mealsById = useMemo(
    () =>
      new Map(catalogue?.meals.map((meal) => [meal.id, meal] as const) ?? []),
    [catalogue],
  );
  const mealsByReference = useMemo(() => {
    const byReference = new Map(
      catalogue?.meals.map(
        (meal) =>
          [
            catalogueMealReferenceKey({
              catalogueMealId: meal.id,
              catalogueVersion: meal.version,
            }),
            meal,
          ] as const,
      ) ?? [],
    );
    for (const meal of pinnedMeals ?? []) {
      byReference.set(
        catalogueMealReferenceKey({
          catalogueMealId: meal.id,
          catalogueVersion: meal.version,
        }),
        meal,
      );
    }
    return byReference;
  }, [catalogue, pinnedMeals]);
  const isArchived = plan.status === "archived";
  const rows = resolveActivePlanWeekRows({
    servings: plan.servings,
    startDate: plan.startDate,
    endDate: plan.endDate,
    mealSlots: plan.mealSlots,
    mealsByReference,
    mealsById,
  });
  const hasPendingAction = isReplanning || isStartingNextPlan;
  const recipeHrefByDate = new Map(
    plan.mealSlots.flatMap((slot) =>
      slot.recipeId || slot.catalogueMealSlug
        ? [
            [
              slot.date,
              slot.recipeId
                ? personalRecipeDetailPath(
                    slot.recipeId,
                    plan.servings,
                    plan.servings,
                  )
                : recipeDetailPath(
                    slot.catalogueMealSlug!,
                    {
                      catalogueMealId: slot.catalogueMealId ?? undefined,
                      catalogueVersion: slot.catalogueVersion ?? undefined,
                    },
                    plan.servings,
                  ),
            ] as const,
          ]
        : [],
    ),
  );
  const plannedCount = plan.mealSlots.filter(
    (slot) => slot.status !== "skipped",
  ).length;
  const nearEnd = !isArchived && isNearActivePlanEnd({ endDate: plan.endDate });
  const summary = isArchived
    ? `${formatPlanDateRange(plan)} · archived`
    : formatGuestPlanSummary({
        planStartDate: plan.startDate,
        planEndDate: plan.endDate,
        plannedMealCount: plannedCount,
      });

  return (
    <main
      aria-labelledby="active-week-heading"
      className="mx-auto flex w-full max-w-175 flex-col px-page-inline pt-4.5 pb-8"
    >
      <SpaceHeader
        headingId="active-week-heading"
        title={
          isArchived
            ? "Previous week"
            : isHousehold
              ? "Our week"
              : household
                ? "My week"
                : "This week"
        }
        summary={
          <p className="text-14 font-medium leading-5 text-graphite">
            {summary}
          </p>
        }
        context={household ? <ContextSelector /> : null}
        action={
          !isArchived ? (
            <ActivePlanAdjustDrawer plan={plan} disabled={hasPendingAction} />
          ) : null
        }
      />

      {!household ? (
        <ButtonLink
          href="/household"
          variant="inline"
          className="mt-2 self-start text-leaf"
        >
          Share your week
        </ButtonLink>
      ) : null}

      {plans.length > 1 ? (
        <div className="relative mt-5">
          <label
            htmlFor="saved-week-selector"
            className="pointer-events-none absolute top-1.5 left-3 z-1 text-10 font-bold tracking-label text-graphite uppercase"
          >
            {isArchived ? "Previous week · view only" : "Active week"}
          </label>
          <select
            id="saved-week-selector"
            value={plan._id}
            onChange={(event) => onSelectPlan(event.target.value)}
            className="h-12 w-full appearance-none rounded-sm border border-border bg-paper px-3 pt-3.5 pr-10 text-16 font-semibold text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cadmium"
          >
            {plans.map((option) => (
              <option key={option._id} value={option._id}>
                {option.status === "active" ? "Active week" : "Previous week"} ·{" "}
                {formatPlanDateRange(option)}
              </option>
            ))}
          </select>
          <ChevronDown
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-graphite"
          />
        </div>
      ) : null}

      <ul className="mt-5">
        {rows.map((row) => (
          <li key={row.date}>
            <PlanMealRow
              key={`${row.date}:${plan.updatedAt}`}
              row={row}
              readOnly={isArchived}
              onRemoveMeal={
                plan.mealSlots.length > 1
                  ? async (date) => {
                      const result = await removeMeal({
                        ...spaceArgs,
                        mealPlanId: plan._id as Id<"mealPlans">,
                        expectedUpdatedAt: plan.updatedAt,
                        date,
                      });
                      if (result.status !== "removed") {
                        toast.error(
                          "This week changed. Review the latest week.",
                        );
                        throw new Error("Plan changed");
                      }
                    }
                  : undefined
              }
              onReplaceMeal={async (date, catalogueMealId) => {
                const selected = catalogue?.meals.find(
                  (meal) => meal.id === catalogueMealId,
                );
                if (!selected) throw new Error("Recipe unavailable");
                const result = await putMeal({
                  ...spaceArgs,
                  mealPlanId: plan._id as Id<"mealPlans">,
                  expectedUpdatedAt: plan.updatedAt,
                  date,
                  catalogueMealId,
                  catalogueVersion: selected.version,
                });
                if (result.status !== "planned") {
                  toast.error("This week changed. Review the latest week.");
                  throw new Error("Plan changed");
                }
              }}
              onChooseMeal={async (date) => {
                const slot = plan.mealSlots.find((slot) => slot.date === date);
                if (slot?.slotId) {
                  const result = await swapMeal({
                    ...spaceArgs,
                    mealSlotId: slot.slotId as Id<"mealSlots">,
                    expectedUpdatedAt: plan.updatedAt,
                  });
                  if (result.status !== "swapped")
                    throw new Error(
                      "Review the latest week before choosing again.",
                    );
                } else {
                  const candidate = catalogue?.meals.find(
                    (meal) =>
                      !plan.mealSlots.some(
                        (slot) => slot.catalogueMealId === meal.id,
                      ),
                  );
                  if (!candidate)
                    throw new Error("No matching meal available.");
                  const result = await putMeal({
                    ...spaceArgs,
                    mealPlanId: plan._id as Id<"mealPlans">,
                    expectedUpdatedAt: plan.updatedAt,
                    date,
                    catalogueMealId: candidate.id,
                    catalogueVersion: candidate.version,
                  });
                  if (result.status !== "planned")
                    throw new Error(
                      "Review the latest week before choosing again.",
                    );
                }
              }}
              recipeHref={recipeHrefByDate.get(row.date)}
            />
          </li>
        ))}
      </ul>

      {isArchived ? null : (
        <div className="mt-4 flex items-center justify-between gap-3 pt-2">
          <Button
            variant="inline"
            disabled={hasPendingAction}
            aria-busy={isReplanning}
            className="h-auto px-0 text-14 font-medium text-graphite"
            onClick={() => {
              void onReplan();
            }}
          >
            {isReplanning ? "Replanning this week…" : "Replan this week"}
          </Button>
          <Button
            variant="inline"
            disabled={hasPendingAction}
            aria-busy={isStartingNextPlan}
            className={cn(
              "h-auto px-0 text-14",
              nearEnd
                ? "font-semibold text-cadmium"
                : "font-medium text-graphite",
            )}
            onClick={() => {
              void onStartNextPlan();
            }}
          >
            {isStartingNextPlan
              ? "Starting next plan…"
              : nearEnd
                ? "Start next plan →"
                : "Start next plan"}
          </Button>
        </div>
      )}
    </main>
  );
}
