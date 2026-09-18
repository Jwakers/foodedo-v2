"use client";

import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import type { Id } from "../../../convex/_generated/dataModel";
import { useState } from "react";
import { toast } from "sonner";

import { api } from "../../../convex/_generated/api";
import { AccountConnectionError } from "@/components/account-connection-error";
import { Button } from "@/components/ui/button";
import {
  ActiveWeek,
  type ActiveWeekPlanSummary,
} from "@/features/plan/active-week";
import {
  beginNextGuestPlanDraft,
  beginReplannedGuestPlanDraft,
} from "@/features/plan/guest-plan-draft";
import { PlanReview } from "@/features/plan/plan-review";
import { PlanReviewLoading } from "@/features/plan/plan-review-loading";
import { savedPlanMealChoices } from "@/features/plan/saved-plan-meal-choices";
import { useCurrentCatalogue } from "@/features/recipes/use-catalogue";
import { useFoodedoAuth } from "@/features/auth/use-foodedo-auth";

/**
 * Week tab: guest/temporary review vs signed-in active week. Archived plan
 * metadata stays cheap; a previous week's slots load only when selected.
 */
export function WeekPage() {
  const router = useRouter();
  const { status, isAuthenticated } = useFoodedoAuth();
  const currentPlan = useQuery(
    api.mealPlans.getCurrent,
    isAuthenticated ? {} : "skip",
  );
  const archivedPlanSummaries = useQuery(
    api.mealPlans.getRecentArchivedSummaries,
    isAuthenticated ? {} : "skip",
  );
  const planningPreferences = useQuery(
    api.planningPreferences.getCurrent,
    isAuthenticated ? {} : "skip",
  );
  const catalogue = useCurrentCatalogue();
  const [selectedPlanId, setSelectedPlanId] = useState<Id<"mealPlans"> | null>(
    null,
  );
  const [pendingPlanAction, setPendingPlanAction] = useState<
    "replan" | "next" | null
  >(null);
  const selectedArchivedPlan = useQuery(
    api.mealPlans.getArchived,
    isAuthenticated && selectedPlanId !== null
      ? { mealPlanId: selectedPlanId }
      : "skip",
  );

  const isCheckingPlan =
    status === "loading" ||
    catalogue === undefined ||
    (isAuthenticated &&
      (currentPlan === undefined || planningPreferences === undefined));

  if (isCheckingPlan) {
    return <PlanReviewLoading />;
  }

  if (status === "connection_error") {
    return <AccountConnectionError />;
  }

  if (catalogue === null) {
    return (
      <main className="mx-auto flex min-h-[45vh] w-full max-w-175 flex-col items-start justify-center px-page-inline py-10">
        <h1 className="font-display text-30 font-semibold tracking-title text-ink">
          Recipes are temporarily unavailable
        </h1>
        <p className="mt-2 text-15 text-graphite">
          Try again before planning another week.
        </p>
        <Button className="mt-5" onClick={() => window.location.reload()}>
          Try again
        </Button>
      </main>
    );
  }

  const catalogueContract = {
    currentMeals: catalogue.meals.map((meal) => ({
      catalogueMealId: meal.id,
      catalogueVersion: meal.version,
    })),
    readableMeals: catalogue.meals.map((meal) => ({
      catalogueMealId: meal.id,
      catalogueVersion: meal.version,
    })),
  };

  if (currentPlan) {
    const activePlan = currentPlan;

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
      activePlan,
      ...(archivedPlanSummaries ?? []),
    ];

    async function handleReplan() {
      if (pendingPlanAction !== null) return;

      setPendingPlanAction("replan");
      try {
        await beginReplannedGuestPlanDraft({
          catalogue: catalogueContract,
          planStartDate: activePlan.startDate,
          servings: activePlan.servings,
          occupiedDates: activePlan.mealSlots.map((slot) => slot.date),
          currentMealChoices: savedPlanMealChoices({
            planStartDate: activePlan.startDate,
            planEndDate: activePlan.endDate,
            mealSlots: activePlan.mealSlots,
          }),
        });
        router.push("/week/replan");
      } catch (error) {
        console.error("Failed to replan the active plan.", error);
        toast.error(
          "Foodedo couldn’t replan this week. Check storage access and try again.",
        );
        setPendingPlanAction(null);
      }
    }

    async function handleStartNextPlan() {
      if (pendingPlanAction !== null) return;

      setPendingPlanAction("next");
      try {
        await beginNextGuestPlanDraft({
          catalogue: catalogueContract,
          planDays: planningPreferences?.usualPlanDays ?? 7,
          servings: planningPreferences?.usualServings ?? 4,
        });
        router.push("/week/new");
      } catch (error) {
        console.error("Failed to start the next plan.", error);
        toast.error(
          "Foodedo couldn’t start your next plan. Check storage access and try again.",
        );
        setPendingPlanAction(null);
      }
    }

    return (
      <ActiveWeek
        plan={selectedArchivedPlan ?? activePlan}
        plans={plans}
        isReplanning={pendingPlanAction === "replan"}
        isStartingNextPlan={pendingPlanAction === "next"}
        onReplan={handleReplan}
        onStartNextPlan={handleStartNextPlan}
        onSelectPlan={(mealPlanId) => {
          setSelectedPlanId(
            mealPlanId === activePlan._id
              ? null
              : (mealPlanId as Id<"mealPlans">),
          );
        }}
      />
    );
  }

  return <PlanReview />;
}
