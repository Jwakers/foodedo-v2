"use client";

import { ArrowRight, Clock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PlanMealRow } from "@/features/plan/plan-meal-row";
import type { GuestPlanMealRow } from "@/lib/domain/plan-display";
import { temporaryFeedback } from "@/lib/ui/temporary-feedback";

export function PlanReviewReady({
  summary,
  rows,
  isShuffling,
  onSavePlan,
  onTryAnotherWeek,
  onRemoveMeal,
}: {
  summary: string;
  rows: GuestPlanMealRow[];
  isShuffling: boolean;
  onSavePlan: () => void;
  onTryAnotherWeek: () => void | Promise<void>;
  onRemoveMeal: (date: string) => Promise<unknown> | void;
}) {
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
        <p className="text-14 font-medium text-graphite">{summary}</p>
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
        {rows.map((row) => (
          <li key={row.date}>
            <PlanMealRow row={row} onRemoveMeal={onRemoveMeal} />
          </li>
        ))}
      </ul>

      <div className="mt-5 flex flex-col gap-2">
        <Button className="w-full" onClick={onSavePlan}>
          Save my plan
          <ArrowRight aria-hidden="true" className="size-4.5" />
        </Button>
        <Button
          variant="inline"
          size="block"
          disabled={isShuffling}
          aria-busy={isShuffling}
          onClick={() => {
            void (async () => {
              try {
                await onTryAnotherWeek();
              } catch (error) {
                console.error("Failed to shuffle guest plan draft.", error);
                temporaryFeedback(
                  "Foodedo couldn’t refresh this week. Check storage access and try again.",
                );
              }
            })();
          }}
        >
          {isShuffling ? "Finding another week…" : "Try another week"}
        </Button>
      </div>
    </main>
  );
}
