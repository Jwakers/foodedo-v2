"use client";

import { CalendarPlus, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { usePlanThisMeal } from "@/features/plan/use-plan-this-meal";
import {
  formatPlanDateWithWeekday,
  formatPlanDayParts,
} from "@/lib/domain/plan-display";
import type { PlanThisMealDay } from "@/lib/domain/plan-this-meal";
import { cn } from "@/lib/utils/cn";

export function PlanThisMeal({
  meal,
}: {
  meal: { id: string; version: number; title: string };
}) {
  const planner = usePlanThisMeal({
    catalogueMealId: meal.id,
    catalogueVersion: meal.version,
  });

  return (
    <Drawer
      open={planner.isOpen}
      handleOnly
      onOpenChange={(open) => {
        if (!open) planner.closePlanner();
      }}
    >
      <DrawerTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="w-full"
          disabled={!planner.isReady || planner.isOpening}
          aria-busy={planner.isOpening || undefined}
          onClick={() => void planner.openPlanner()}
        >
          <CalendarPlus
            aria-hidden="true"
            className="size-4.5"
            strokeWidth={2}
          />
          Plan this meal
        </Button>
      </DrawerTrigger>

      <DrawerContent>
        <DrawerHeader className="flex-col items-stretch gap-0.5">
          <DrawerTitle>Plan this meal</DrawerTitle>
          <DrawerDescription>Choose a day for {meal.title}.</DrawerDescription>
        </DrawerHeader>
        <DrawerBody>
          <ul>
            {planner.days.map((day) => (
              <li key={day.date}>
                <PlanDayOption
                  day={day}
                  mealId={meal.id}
                  isPlanning={planner.planningDate === day.date}
                  disabled={
                    planner.planningDate !== null || planner.isAddingDay
                  }
                  onSelect={() => void planner.planOnDate(day.date)}
                />
              </li>
            ))}
          </ul>
          {planner.nextPlanDate ? (
            <div className="flex flex-col items-center gap-1.5 py-4">
              <Button
                type="button"
                variant="secondary"
                disabled={planner.isAddingDay || planner.planningDate !== null}
                aria-busy={planner.isAddingDay || undefined}
                className="h-11 w-full rounded-full border-leaf text-13 font-semibold text-leaf hover:border-leaf hover:bg-leaf-soft disabled:border-border"
                onClick={() => void planner.addDay()}
              >
                {planner.isAddingDay ? (
                  "Adding another day…"
                ) : (
                  <>
                    <Plus aria-hidden="true" className="size-4" />
                    Add another day
                  </>
                )}
              </Button>
              <p className="max-w-80 text-center text-11 leading-4 text-graphite">
                Adds {formatPlanDateWithWeekday(planner.nextPlanDate)} with{" "}
                {meal.title}.
              </p>
            </div>
          ) : null}
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}

function PlanDayOption({
  day,
  mealId,
  isPlanning,
  disabled,
  onSelect,
}: {
  day: PlanThisMealDay;
  mealId: string;
  isPlanning: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  const { weekday, dayOfMonth } = formatPlanDayParts(day.date);
  const dateLabel = formatPlanDateWithWeekday(day.date);
  const isThisMeal = day.planned?.catalogueMealId === mealId;
  const action = isThisMeal ? "Planned" : day.planned ? "Replace" : "Add";

  return (
    <Button
      type="button"
      variant="ghost"
      disabled={disabled || isThisMeal}
      aria-busy={isPlanning || undefined}
      aria-label={
        isThisMeal
          ? `Already planned for ${dateLabel}`
          : day.planned
            ? `Replace ${day.planned.title} on ${dateLabel}`
            : `Add to ${dateLabel}`
      }
      className="h-auto min-h-16 w-full justify-start gap-3 rounded-none border-b border-border px-0 py-2.5 text-left font-normal hover:bg-transparent disabled:cursor-default disabled:opacity-100"
      onClick={onSelect}
    >
      <span className="flex w-9 shrink-0 flex-col gap-0.75">
        <span className="text-10 font-bold tracking-label text-graphite">
          {weekday}
        </span>
        <span className="font-display text-18 font-semibold text-ink">
          {dayOfMonth}
        </span>
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-display text-16 font-semibold tracking-card text-ink">
          {day.planned?.title ?? "No meal planned"}
        </span>
        <span className="text-12 text-graphite">
          {isThisMeal
            ? "Already this meal"
            : day.planned
              ? "Replaces this meal"
              : "Free day"}
        </span>
      </span>
      <span
        className={cn(
          "flex h-6.5 shrink-0 items-center rounded-sm px-2.5 text-10 font-semibold whitespace-nowrap",
          isThisMeal
            ? "bg-mist text-graphite"
            : day.planned
              ? "bg-mist text-ink"
              : "bg-leaf text-paper",
          isPlanning && "opacity-55",
        )}
      >
        {isPlanning ? "Planning…" : action}
      </span>
    </Button>
  );
}
