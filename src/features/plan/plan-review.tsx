"use client";

import { useState } from "react";

import { useSaveGuestPlan } from "@/features/plan/guest-plan-claim";
import { PlanReviewEmpty } from "@/features/plan/plan-review-empty";
import { PlanReviewError } from "@/features/plan/plan-review-error";
import { PlanReviewLoading } from "@/features/plan/plan-review-loading";
import { PlanReviewReady } from "@/features/plan/plan-review-ready";
import { useGuestPlanDraft } from "@/features/plan/use-guest-plan-draft";

export function PlanReview() {
  const { state, retry, startPlan, tryAnotherWeek, removeMeal, replaceMeal } =
    useGuestPlanDraft();
  const { isSaving, savePlan, prepareGuestSaveSignIn } = useSaveGuestPlan();
  const [isPlanning, setIsPlanning] = useState(false);
  const [isShuffling, setIsShuffling] = useState(false);

  if (state.status === "loading") {
    return <PlanReviewLoading />;
  }

  if (state.status === "empty") {
    return (
      <PlanReviewEmpty
        isPlanning={isPlanning}
        onPlanWeek={async () => {
          setIsPlanning(true);
          try {
            await startPlan();
          } finally {
            setIsPlanning(false);
          }
        }}
      />
    );
  }

  if (state.status === "error") {
    return <PlanReviewError message={state.message} onRetry={retry} />;
  }

  return (
    <PlanReviewReady
      summary={state.summary}
      rows={state.rows}
      isSaving={isSaving}
      isShuffling={isShuffling}
      onSavePlan={() => {
        void savePlan();
      }}
      onPrepareGuestSaveSignIn={prepareGuestSaveSignIn}
      onRemoveMeal={removeMeal}
      onReplaceMeal={replaceMeal}
      onTryAnotherWeek={async () => {
        setIsShuffling(true);
        try {
          await tryAnotherWeek();
        } finally {
          setIsShuffling(false);
        }
      }}
    />
  );
}
