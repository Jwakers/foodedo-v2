"use client";

import { ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PlanMealRow } from "@/features/plan/plan-meal-row";
import {
  formatActivePlanEndSummary,
  formatGuestPlanSummary,
  formatPlanDateRange,
  isNearActivePlanEnd,
  resolveActivePlanWeekRows,
  todayPlanDate,
  type GuestPlanMealRow,
} from "@/lib/domain/plan-display";
import { standardCatalogue } from "@/lib/domain/standard-catalogue";
import { recipeDetailPath } from "@/lib/routing/recipes";
import { markUnfinishedInteraction } from "@/lib/ui/unfinished-interaction";
import { cn } from "@/lib/utils/cn";

export type ActiveWeekPlan = {
  _id: string;
  startDate: string;
  endDate: string;
  status: "active" | "archived";
  mealSlots: ReadonlyArray<{
    date: string;
    status: "planned" | "cooked" | "skipped";
    title: string;
    description: string | null;
    imageSrc: string | null;
    catalogueMealId: string | null;
    catalogueMealSlug: string | null;
    prepMinutes: number | null;
    cookMinutes: number | null;
  }>;
};

export type ActiveWeekPlanSummary = Pick<
  ActiveWeekPlan,
  "_id" | "startDate" | "endDate" | "status"
>;

const standardMealsById = new Map(
  standardCatalogue.meals.map((meal) => [meal.id, meal] as const),
);

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
  const isArchived = plan.status === "archived";
  const rows = resolveActivePlanWeekRows({
    startDate: plan.startDate,
    mealSlots: plan.mealSlots,
    mealsById: standardMealsById,
  });
  const recipeHrefByDate = new Map(
    plan.mealSlots.flatMap((slot) =>
      slot.catalogueMealSlug
        ? [[slot.date, recipeDetailPath(slot.catalogueMealSlug)] as const]
        : [],
    ),
  );
  const plannedCount = plan.mealSlots.filter(
    (slot) => slot.status === "planned",
  ).length;
  const nearEnd = !isArchived && isNearActivePlanEnd({ endDate: plan.endDate });
  const today = todayPlanDate();
  const dinnersLeft = plan.mealSlots.filter(
    (slot) => slot.status === "planned" && slot.date >= today,
  ).length;
  const summary = isArchived
    ? `${formatPlanDateRange(plan)} · archived`
    : nearEnd
      ? formatActivePlanEndSummary({
          endDate: plan.endDate,
          dinnersLeft,
        })
      : formatGuestPlanSummary({
          planStartDate: plan.startDate,
          plannedMealCount: plannedCount,
        });

  return (
    <main
      aria-labelledby="active-week-heading"
      className="mx-auto flex w-full max-w-175 flex-col px-page-inline pt-4.5 pb-8"
    >
      <div className="flex flex-col gap-1.5">
        <h1
          id="active-week-heading"
          className="font-display text-30 font-semibold tracking-title text-ink"
        >
          {isArchived ? "Previous week" : "This week"}
        </h1>
        <p className="text-14 font-medium text-graphite">{summary}</p>
      </div>

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
            className="h-12 w-full appearance-none rounded-sm border border-border bg-paper px-3 pt-3.5 pr-10 text-14 font-semibold text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cadmium"
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
            <ActiveWeekMealRow
              row={row}
              readOnly={isArchived}
              recipeHref={recipeHrefByDate.get(row.date)}
            />
          </li>
        ))}
      </ul>

      {isArchived ? null : (
        <div className="mt-4 flex items-center justify-between gap-3 pt-2">
          <Button
            variant="inline"
            disabled={isReplanning || isStartingNextPlan}
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
            disabled={isReplanning || isStartingNextPlan}
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

function ActiveWeekMealRow({
  row,
  readOnly,
  recipeHref,
}: {
  row: GuestPlanMealRow;
  readOnly: boolean;
  recipeHref?: string;
}) {
  return (
    <PlanMealRow
      row={row}
      readOnly={readOnly}
      recipeHref={recipeHref}
      onRemoveMeal={() => {
        markUnfinishedInteraction("Removing a saved meal comes next.");
      }}
      onReplaceMeal={() => {
        markUnfinishedInteraction("Swapping a saved meal comes next.");
      }}
    />
  );
}
