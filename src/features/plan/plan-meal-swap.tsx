"use client";

import {
  ArrowRight,
  Check,
  ChevronRight,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import Image from "next/image";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { DrawerBody, DrawerFooter } from "@/components/ui/drawer";
import { useDrawerStack } from "@/components/ui/drawer-stack";
import { DrawerStackHeader } from "@/components/ui/drawer-stack-header";
import { planMealDrawerViews } from "@/features/plan/plan-meal-drawer";
import {
  formatMealDurationLabel,
  formatPlanWeekdayLong,
  formatPlanWeekdayShort,
  formatProteinCategoryLabel,
  type GuestPlanMealRow,
} from "@/lib/domain/plan-display";
import type { CatalogueMeal } from "@/lib/domain/recipes";
import { standardCatalogue } from "@/lib/domain/standard-catalogue";
import { temporaryFeedback } from "@/lib/ui/temporary-feedback";
import { cn } from "@/lib/utils/cn";

const quickFilterLabels = [
  "All",
  "Under 30 min",
  "Vegetarian",
  "Budget friendly",
] as const;

export function PlanMealSwap({
  row,
  isSwapping = false,
  onSwap,
}: {
  row: Extract<GuestPlanMealRow, { kind: "planned" }>;
  isSwapping?: boolean;
  onSwap: (catalogueMealId: string) => Promise<unknown> | void;
}) {
  const { push } = useDrawerStack();
  const candidates = standardCatalogue.meals.filter(
    (meal) => meal.id !== row.meal.id,
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedMeal =
    candidates.find((meal) => meal.id === selectedId) ?? null;

  const weekdayLong = formatPlanWeekdayLong(row.date);
  const weekdayShort = formatPlanWeekdayShort(row.date);

  return (
    <>
      <DrawerStackHeader
        title={`Swap ${weekdayLong}’s meal`}
        description="Choose a better fit for your week"
        closeLabel="Close recipe picker"
      />

      <DrawerBody className="flex min-h-0 flex-1 flex-col gap-0 pb-4">
        <div className="flex shrink-0 items-center gap-3 pb-4">
          <div className="relative h-12.5 w-14.5 shrink-0 overflow-hidden rounded-sm bg-mist">
            {row.meal.imageSrc ? (
              <Image
                src={row.meal.imageSrc}
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
              {row.meal.title}
            </p>
          </div>
          <span className="shrink-0 text-13 text-graphite">{weekdayShort}</span>
        </div>

        <button
          type="button"
          aria-label="Search recipes"
          className="flex h-12 w-full shrink-0 items-center gap-2.5 rounded-md bg-mist px-3.5 text-left transition-colors hover:bg-border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cadmium"
          onClick={() => {
            temporaryFeedback("Recipe search comes next.");
          }}
        >
          <Search
            aria-hidden="true"
            className="size-5 shrink-0 text-graphite"
            strokeWidth={2}
          />
          <span className="text-15 text-graphite">Search recipes</span>
        </button>

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
          <div className="-mr-page-inline flex min-w-0 flex-1 gap-2 overflow-x-auto pr-page-inline scrollbar-none">
            {quickFilterLabels.map((label, index) => {
              const active = index === 0;
              return (
                <Button
                  key={label}
                  variant="filter"
                  aria-pressed={active}
                  onClick={() => {
                    if (label === "All") {
                      temporaryFeedback("Recipe filters come next.");
                      return;
                    }
                    push(planMealDrawerViews.filters);
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
            {candidates.length} {candidates.length === 1 ? "recipe" : "recipes"}
          </p>
        </div>

        <ul
          className="flex min-h-0 flex-1 flex-col"
          role="listbox"
          aria-label="Recipe matches"
        >
          {candidates.map((meal) => (
            <SwapCandidateRow
              key={meal.id}
              meal={meal}
              selected={meal.id === selectedId}
              disabled={isSwapping}
              onSelect={() => setSelectedId(meal.id)}
            />
          ))}
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
            {selectedMeal ? `Swap in ${selectedMeal.title}` : "Choose a recipe"}
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
}: {
  meal: CatalogueMeal;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  const durationLabel = formatMealDurationLabel(
    meal.prepMinutes,
    meal.cookMinutes,
  );
  const meta = [
    durationLabel,
    formatProteinCategoryLabel(meal.proteinCategory),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="shrink-0" role="presentation">
      <button
        type="button"
        role="option"
        aria-selected={selected}
        disabled={disabled}
        className="flex w-full min-h-21.5 items-center gap-3 border-b border-border py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cadmium disabled:opacity-55"
        onClick={onSelect}
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
          ) : null}
        </div>

        <span
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded-full",
            selected
              ? "bg-cadmium text-paper"
              : "border-1.5 border-control-muted",
          )}
          aria-hidden="true"
        >
          {selected ? <Check className="size-3.5" strokeWidth={3} /> : null}
        </span>
      </button>
    </li>
  );
}
