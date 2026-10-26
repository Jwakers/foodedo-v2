"use client";

import { ButtonLink } from "@/components/ui/button";
import { PlanSetupPage } from "./plan-setup-page";

export function PlanReviewEmpty({
  onPlanWeek,
}: {
  onPlanWeek: () => Promise<unknown>;
}) {
  return <PlanSetupPage onPlanCreated={onPlanWeek} />;
}

export function PlanReviewMissingReplan() {
  return (
    <main className="mx-auto flex min-h-[45vh] w-full max-w-175 flex-col items-start justify-center px-page-inline py-10">
      <h1 className="font-display text-30 font-semibold tracking-title text-ink">
        There’s no replan to review
      </h1>
      <p className="mt-2 text-15 text-graphite">
        Return to your saved week and choose Replan this week to generate a new
        set of meals.
      </p>
      <ButtonLink href="/week" className="mt-5">
        Return to Week
      </ButtonLink>
    </main>
  );
}
