"use client";

import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { temporaryFeedback } from "@/lib/ui/temporary-feedback";

export function PlanReviewEmpty({
  isPlanning,
  onPlanWeek,
}: {
  isPlanning: boolean;
  onPlanWeek: () => void | Promise<void>;
}) {
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
        aria-busy={isPlanning}
        onClick={() => {
          void (async () => {
            try {
              await onPlanWeek();
            } catch (error) {
              console.error("Failed to create guest plan draft.", error);
              temporaryFeedback(
                "Foodedo couldn’t start your week. Check storage access and try again.",
              );
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
