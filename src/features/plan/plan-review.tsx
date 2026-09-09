"use client";

import { ArrowRight, Clock, Ellipsis, Plus } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useGuestPlanDraft } from "@/features/plan/use-guest-plan-draft";
import type { GuestPlanMealRow } from "@/lib/domain/plan-display";

export function PlanReview() {
  const { state, retry, startPlan, tryAnotherWeek } = useGuestPlanDraft();
  const [isPlanning, setIsPlanning] = useState(false);
  const [isShuffling, setIsShuffling] = useState(false);

  if (state.status === "loading") {
    return (
      <main
        className="mx-auto w-full max-w-175 px-page-inline pt-4.5 pb-8"
        aria-busy="true"
        aria-label="Loading your week"
      >
        <div className="h-9 w-56 rounded-sm bg-mist" />
        <div className="mt-2 h-5 w-48 rounded-sm bg-mist" />
        <div className="mt-6 h-16 rounded-md bg-mist" />
        <div className="mt-6 space-y-0">
          {Array.from({ length: 5 }, (_, index) => (
            <div
              key={index}
              className="flex min-h-21.5 items-center gap-2.5 border-b border-border py-2.5"
            >
              <div className="h-12 w-9 rounded-sm bg-mist" />
              <div className="h-16.5 w-20.5 rounded-[11px] bg-mist" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-5 w-36 rounded-sm bg-mist" />
                <div className="h-4 w-24 rounded-sm bg-mist" />
              </div>
            </div>
          ))}
        </div>
      </main>
    );
  }

  if (state.status === "empty") {
    return (
      <main
        aria-labelledby="plan-empty-heading"
        className="mx-auto flex w-full max-w-175 flex-col gap-4 px-page-inline pt-4.5 pb-8"
      >
        <div className="flex flex-col gap-1.5">
          <h1
            id="plan-empty-heading"
            className="font-display text-30 font-semibold tracking-title text-ink"
          >
            No week planned yet
          </h1>
          <p className="text-14 font-medium text-graphite">
            Seven useful dinners in one tap. Adjust anything after.
          </p>
        </div>
        <Button
          className="w-full"
          disabled={isPlanning}
          onClick={() => {
            void (async () => {
              setIsPlanning(true);
              try {
                await startPlan();
              } catch (error) {
                console.error("Failed to create guest plan draft.", error);
                window.alert(
                  "Foodedo couldn’t start your week. Check storage access and try again.",
                );
              } finally {
                setIsPlanning(false);
              }
            })();
          }}
        >
          {isPlanning ? "Planning your week…" : "Plan my week"}
          {isPlanning ? null : (
            <ArrowRight aria-hidden="true" className="size-4.5" />
          )}
        </Button>
      </main>
    );
  }

  if (state.status === "error") {
    return (
      <main
        aria-labelledby="plan-error-heading"
        className="mx-auto flex w-full max-w-175 flex-col gap-4 px-page-inline pt-4.5 pb-8"
      >
        <div className="flex flex-col gap-1.5">
          <h1
            id="plan-error-heading"
            className="font-display text-30 font-semibold tracking-title text-ink"
          >
            Couldn’t open your week
          </h1>
          <p className="text-14 text-danger">{state.message}</p>
        </div>
        <Button className="w-full" onClick={() => void retry()}>
          Try again
        </Button>
      </main>
    );
  }

  async function handleTryAnotherWeek() {
    setIsShuffling(true);
    try {
      await tryAnotherWeek();
    } catch (error) {
      console.error("Failed to shuffle guest plan draft.", error);
      window.alert(
        "Foodedo couldn’t refresh this week. Check storage access and try again.",
      );
    } finally {
      setIsShuffling(false);
    }
  }

  function handleSavePlan() {
    window.alert("Saving your plan comes next.");
  }

  return (
    <main
      aria-labelledby="plan-review-heading"
      className="mx-auto flex w-full max-w-175 flex-col px-page-inline pt-4.5 pb-8"
    >
      <div className="flex flex-col gap-1.5">
        <h1
          id="plan-review-heading"
          className="font-display text-30 font-semibold tracking-title text-ink"
        >
          Your week is ready
        </h1>
        <p className="text-14 font-medium text-graphite">{state.summary}</p>
      </div>

      <div className="mt-5 flex items-center gap-2.5 rounded-md border border-mist bg-mist p-3">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-leaf-soft text-leaf">
          <Clock aria-hidden="true" className="size-3.5" strokeWidth={1.8} />
        </div>
        <p className="text-14 text-graphite">
          Keep planning—sign in later to save this week.
        </p>
      </div>

      <ul className="mt-5">
        {state.rows.map((row) => (
          <li key={row.date}>
            <PlanMealRow row={row} />
          </li>
        ))}
      </ul>

      <div className="mt-5 flex flex-col gap-2">
        <Button className="w-full" onClick={handleSavePlan}>
          Save my plan
          <ArrowRight aria-hidden="true" className="size-4.5" />
        </Button>
        <Button
          variant="inline"
          className="h-11 w-full justify-center text-14 font-semibold text-ink"
          disabled={isShuffling}
          onClick={() => void handleTryAnotherWeek()}
        >
          {isShuffling ? "Finding another week…" : "Try another week"}
        </Button>
      </div>
    </main>
  );
}

function PlanMealRow({ row }: { row: GuestPlanMealRow }) {
  if (row.kind === "empty") {
    return (
      <div className="flex min-h-21.5 items-center gap-2.5 border-b border-border py-2.5">
        <PlanDayLabel weekday={row.weekday} dayOfMonth={row.dayOfMonth} />

        <div className="flex h-16.5 w-20.5 shrink-0 items-center justify-center rounded-[11px] bg-leaf-soft text-leaf">
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
          variant="leafChip"
          onClick={() => {
            window.alert("Adding a meal comes next.");
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

      <div className="relative h-16.5 w-20.5 shrink-0 overflow-hidden rounded-[11px] bg-mist">
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

      <button
        type="button"
        aria-label={`Actions for ${row.meal.title}`}
        className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-mist text-graphite transition-colors hover:bg-border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cadmium"
        onClick={() => {
          window.alert("Meal actions come next.");
        }}
      >
        <Ellipsis aria-hidden="true" className="size-4" strokeWidth={2} />
      </button>
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
