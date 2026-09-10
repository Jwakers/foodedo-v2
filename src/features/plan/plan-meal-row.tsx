"use client";

import { Ellipsis, Plus } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerTrigger } from "@/components/ui/drawer";
import { PlanMealActions } from "@/features/plan/plan-meal-actions";
import type { GuestPlanMealRow } from "@/lib/domain/plan-display";
import { temporaryFeedback } from "@/lib/ui/temporary-feedback";

export function PlanMealRow({
  row,
  onRemoveMeal,
}: {
  row: GuestPlanMealRow;
  onRemoveMeal?: (date: string) => Promise<unknown> | void;
}) {
  if (row.kind === "empty") {
    return (
      <div className="flex min-h-21.5 items-center gap-2.5 border-b border-border py-2.5">
        <PlanDayLabel weekday={row.weekday} dayOfMonth={row.dayOfMonth} />

        <div className="flex h-16.5 w-20.5 shrink-0 items-center justify-center rounded-sm bg-leaf-soft text-leaf">
          <Plus aria-hidden="true" className="size-6" strokeWidth={1.7} />
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="font-display text-16 font-semibold tracking-card text-ink">
            No meal planned
          </p>
          <p className="text-11 text-graphite">Leave it free or add a meal</p>
        </div>

        <Button
          type="button"
          variant="leaf"
          size="chip"
          onClick={() => {
            temporaryFeedback("Adding a meal comes next.");
          }}
        >
          Add meal
        </Button>
      </div>
    );
  }

  return <PlannedMealRow row={row} onRemoveMeal={onRemoveMeal} />;
}

function PlannedMealRow({
  row,
  onRemoveMeal,
}: {
  row: Extract<GuestPlanMealRow, { kind: "planned" }>;
  onRemoveMeal?: (date: string) => Promise<unknown> | void;
}) {
  const [open, setOpen] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  return (
    <div className="flex min-h-21.5 items-center gap-2.5 border-b border-border py-2.5">
      <PlanDayLabel weekday={row.weekday} dayOfMonth={row.dayOfMonth} />

      <div className="relative h-16.5 w-20.5 shrink-0 overflow-hidden rounded-sm bg-mist">
        {row.meal.imageSrc ? (
          <Image
            src={row.meal.imageSrc}
            alt=""
            fill
            sizes="82px"
            className="object-cover"
          />
        ) : null}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="truncate font-display text-18 font-semibold tracking-card text-ink">
          {row.meal.title}
        </p>
        {row.durationLabel ? (
          <p className="text-12 text-graphite">{row.durationLabel}</p>
        ) : null}
      </div>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerTrigger asChild>
          <Button
            type="button"
            variant="quiet"
            size="icon"
            aria-label={`Actions for ${row.meal.title}`}
          >
            <Ellipsis aria-hidden="true" className="size-4" strokeWidth={2} />
          </Button>
        </DrawerTrigger>
        <DrawerContent>
          <PlanMealActions
            mealTitle={row.meal.title}
            isRemoving={isRemoving}
            onChooseRecipe={() => {
              setOpen(false);
              temporaryFeedback("Choosing a recipe comes next.");
            }}
            onChooseForMe={() => {
              setOpen(false);
              temporaryFeedback("Choosing for you comes next.");
            }}
            onRemove={() => {
              if (!onRemoveMeal || isRemoving) return;
              void (async () => {
                setIsRemoving(true);
                setOpen(false);
                try {
                  await onRemoveMeal(row.date);
                } catch (error) {
                  console.error("Failed to remove guest plan meal.", error);
                  temporaryFeedback(
                    "Foodedo couldn’t remove that meal. Check storage access and try again.",
                  );
                } finally {
                  setIsRemoving(false);
                }
              })();
            }}
          />
        </DrawerContent>
      </Drawer>
    </div>
  );
}

function PlanDayLabel({
  weekday,
  dayOfMonth,
}: {
  weekday: string;
  dayOfMonth: string;
}) {
  return (
    <div className="flex w-9 shrink-0 flex-col gap-0.75">
      <span className="text-10 font-bold tracking-label text-graphite">
        {weekday}
      </span>
      <span className="font-display text-18 font-semibold text-ink">
        {dayOfMonth}
      </span>
    </div>
  );
}
