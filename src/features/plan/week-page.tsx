"use client";

import { useAuth } from "@clerk/react";
import { useConvexAuth, useQuery } from "convex/react";
import type { Id } from "../../../convex/_generated/dataModel";
import { useState } from "react";

import { api } from "../../../convex/_generated/api";
import { AccountConnectionError } from "@/components/account-connection-error";
import { Button } from "@/components/ui/button";
import {
  ActiveWeek,
  type ActiveWeekPlanSummary,
} from "@/features/plan/active-week";
import { PlanReview } from "@/features/plan/plan-review";
import { PlanReviewLoading } from "@/features/plan/plan-review-loading";

/**
 * Week tab: guest/temporary review vs signed-in active week. Archived plan
 * metadata stays cheap; a previous week's slots load only when selected.
 */
export function WeekPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const { isAuthenticated, isLoading: isConvexAuthLoading } = useConvexAuth();
  const currentPlan = useQuery(
    api.mealPlans.getCurrent,
    isAuthenticated ? {} : "skip",
  );
  const archivedPlanSummaries = useQuery(
    api.mealPlans.getRecentArchivedSummaries,
    isAuthenticated ? {} : "skip",
  );
  const [selectedPlanId, setSelectedPlanId] = useState<Id<"mealPlans"> | null>(
    null,
  );
  const selectedArchivedPlan = useQuery(
    api.mealPlans.getArchived,
    isAuthenticated && selectedPlanId !== null
      ? { mealPlanId: selectedPlanId }
      : "skip",
  );

  const isCheckingPlan =
    !isLoaded ||
    (isSignedIn && isConvexAuthLoading) ||
    (isAuthenticated && currentPlan === undefined);

  if (isCheckingPlan) {
    return <PlanReviewLoading />;
  }

  if (isSignedIn && !isAuthenticated) {
    return <AccountConnectionError />;
  }

  if (currentPlan) {
    if (selectedPlanId !== null && selectedArchivedPlan === undefined) {
      return <PlanReviewLoading />;
    }

    if (selectedPlanId !== null && selectedArchivedPlan === null) {
      return (
        <main className="mx-auto flex min-h-[45vh] w-full max-w-175 flex-col items-start justify-center px-page-inline py-10">
          <h1 className="font-display text-30 font-semibold tracking-title text-ink">
            That previous week is no longer available
          </h1>
          <p className="mt-2 text-15 text-graphite">
            Your active week is unchanged.
          </p>
          <Button
            className="mt-5"
            onClick={() => {
              setSelectedPlanId(null);
            }}
          >
            Return to this week
          </Button>
        </main>
      );
    }

    const plans: ActiveWeekPlanSummary[] = [
      currentPlan,
      ...(archivedPlanSummaries ?? []),
    ];

    return (
      <ActiveWeek
        plan={selectedArchivedPlan ?? currentPlan}
        plans={plans}
        onSelectPlan={(mealPlanId) => {
          setSelectedPlanId(
            mealPlanId === currentPlan._id
              ? null
              : (mealPlanId as Id<"mealPlans">),
          );
        }}
      />
    );
  }

  return <PlanReview />;
}
