"use client";

import { useAuth } from "@clerk/react";
import { useConvexAuth, useQuery } from "convex/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { api } from "../../../convex/_generated/api";
import { ActiveWeek } from "@/features/plan/active-week";
import { PlanReview } from "@/features/plan/plan-review";
import { PlanReviewLoading } from "@/features/plan/plan-review-loading";
import { PlanSavedSuccess } from "@/features/plan/plan-saved-success";
import { useHasSeenFirstSaveSuccess } from "@/features/plan/plan-lifecycle-prefs";
import { formatGuestPlanSummary } from "@/lib/domain/plan-display";

/**
 * Week tab: guest/temporary review vs signed-in active week.
 * First save may surface the Shopping discovery success once.
 */
export function WeekPage() {
  return (
    <Suspense fallback={<PlanReviewLoading />}>
      <WeekPageContent />
    </Suspense>
  );
}

function WeekPageContent() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const { isAuthenticated } = useConvexAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const showFirstSave = searchParams.get("firstSave") === "1";
  const recentPlans = useQuery(
    api.mealPlans.getRecent,
    isAuthenticated ? {} : "skip",
  );
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const hasSeenFirstSave = useHasSeenFirstSaveSuccess(userId);
  const currentPlan = recentPlans?.find((plan) => plan.status === "active");
  const selectablePlans =
    currentPlan === undefined
      ? (recentPlans ?? [])
      : [
          currentPlan,
          ...(recentPlans ?? []).filter((plan) => plan._id !== currentPlan._id),
        ];
  const selectedPlan =
    recentPlans?.find((plan) => plan._id === selectedPlanId) ?? currentPlan;

  const isCheckingPlan =
    !isLoaded ||
    (isSignedIn && !isAuthenticated) ||
    (isAuthenticated && recentPlans === undefined);

  useEffect(() => {
    if (!showFirstSave || !hasSeenFirstSave) return;
    router.replace("/week");
  }, [hasSeenFirstSave, router, showFirstSave]);

  if (isCheckingPlan) {
    return <PlanReviewLoading />;
  }

  if (currentPlan) {
    const plannedMealCount = currentPlan.mealSlots.filter(
      (slot) => slot.status === "planned",
    ).length;
    const summary = formatGuestPlanSummary({
      planStartDate: currentPlan.startDate,
      plannedMealCount,
    });

    if (showFirstSave && !hasSeenFirstSave) {
      return <PlanSavedSuccess summary={summary} />;
    }

    return (
      <ActiveWeek
        plan={selectedPlan ?? currentPlan}
        plans={selectablePlans}
        onSelectPlan={setSelectedPlanId}
      />
    );
  }

  return <PlanReview />;
}
