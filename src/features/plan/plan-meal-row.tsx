"use client";

import { Ellipsis, Plus } from "lucide-react";
import Image from "next/image";

import { Button } from "@/components/ui/button";
import type { GuestPlanMealRow } from "@/lib/domain/plan-display";
import { temporaryFeedback } from "@/lib/ui/temporary-feedback";

export function PlanMealRow({ row }: { row: GuestPlanMealRow }) {
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

      <Button
        type="button"
        variant="quiet"
        size="icon"
        aria-label={`Actions for ${row.meal.title}`}
        onClick={() => {
          temporaryFeedback("Meal actions come next.");
        }}
      >
        <Ellipsis aria-hidden="true" className="size-4" strokeWidth={2} />
      </Button>
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
