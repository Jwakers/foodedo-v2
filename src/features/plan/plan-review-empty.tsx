import { PlanAction } from "@/features/plan/plan-action";
import { ButtonLink } from "@/components/ui/button";

export function PlanReviewEmpty({
  onPlanWeek,
}: {
  onPlanWeek: () => void | Promise<unknown>;
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
          Set up the week that works for you, then review every meal before
          saving.
        </p>
      </div>
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
