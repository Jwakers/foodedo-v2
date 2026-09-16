"use client";

import { useAuth } from "@clerk/react";
import { useConvexAuth, useQuery } from "convex/react";

import { api } from "../../../convex/_generated/api";
import { AccountConnectionError } from "@/components/account-connection-error";
import { ButtonLink } from "@/components/ui/button";
import { PlanReviewLoading } from "@/features/plan/plan-review-loading";
import { PlanSavedSuccess } from "@/features/plan/plan-saved-success";
import { formatGuestPlanSummary } from "@/lib/domain/plan-display";

export function SavedWeekPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const { isAuthenticated, isLoading: isConvexAuthLoading } = useConvexAuth();
  const currentPlan = useQuery(
    api.mealPlans.getCurrent,
    isAuthenticated ? {} : "skip",
  );

  const isCheckingPlan =
    !isLoaded ||
    (isSignedIn && isConvexAuthLoading) ||
    (isAuthenticated && currentPlan === undefined);

  if (isCheckingPlan) return <PlanReviewLoading />;

  if (isSignedIn && !isAuthenticated) {
    return <AccountConnectionError />;
  }

  if (!currentPlan) {
    return (
      <main className="mx-auto flex min-h-[45vh] w-full max-w-175 flex-col items-start justify-center px-page-inline py-10">
        <h1 className="font-display text-30 font-semibold tracking-title text-ink">
          We couldn’t confirm that saved week
        </h1>
        <p className="mt-2 text-15 text-graphite">
          Return to Week to check your plan or try saving it again.
        </p>
        <ButtonLink href="/week" className="mt-5">
          Return to Week
        </ButtonLink>
      </main>
    );
  }

  const plannedMealCount = currentPlan.mealSlots.filter(
    (slot) => slot.status === "planned",
  ).length;

  return (
    <PlanSavedSuccess
      summary={formatGuestPlanSummary({
        planStartDate: currentPlan.startDate,
        planEndDate: currentPlan.endDate,
        plannedMealCount,
      })}
    />
  );
}
