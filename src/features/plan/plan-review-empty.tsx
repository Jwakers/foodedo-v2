"use client";
import { ContextSelector } from "@/features/household/context-selector";
import { SpaceHeader } from "@/components/space-header";
import { useHouseholdSpace } from "@/features/household/household-context";
import { PlanAction } from "@/features/plan/plan-action";
import { ButtonLink } from "@/components/ui/button";

export function PlanReviewEmpty({
  onPlanWeek,
}: {
  onPlanWeek: () => void | Promise<unknown>;
}) {
  const { isHousehold, household } = useHouseholdSpace();
  return (
    <main
      aria-labelledby="plan-empty-heading"
      className="mx-auto flex w-full max-w-175 flex-col gap-4 px-page-inline pt-4.5 pb-8"
    >
      <SpaceHeader
        headingId="plan-empty-heading"
        title={
          isHousehold
            ? "Our week"
            : household
              ? "My week"
              : "No week planned yet"
        }
        context={household ? <ContextSelector /> : null}
        summary={
          <p className="text-14 font-medium leading-5 text-graphite">
            Set up the week that works for you, then review every meal before
            saving.
          </p>
        }
      />
      <PlanAction onPlanCreated={onPlanWeek} />
    </main>
  );
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
