"use client";

import { useRef, useState } from "react";

import { useSaveGuestPlan } from "@/features/plan/guest-plan-claim";
import {
  PlanReviewEmpty,
  PlanReviewMissingReplan,
} from "@/features/plan/plan-review-empty";
import { PlanReviewError } from "@/features/plan/plan-review-error";
import { PlanReviewLoading } from "@/features/plan/plan-review-loading";
import { PlanReviewReady } from "@/features/plan/plan-review-ready";
import { useGuestPlanDraft } from "@/features/plan/use-guest-plan-draft";

export function PlanReview({
  mode = "standard",
}: {
  mode?: "standard" | "replan";
}) {
  const {
    state,
    retry,
    startPlan,
    tryAnotherWeek,
    removeMeal,
    replaceMeal,
    addDay,
  } = useGuestPlanDraft();
  const { isSaving, savePlan, prepareGuestSaveSignIn } = useSaveGuestPlan();
  const pendingActionRef = useRef<"shuffle" | "add-day" | null>(null);
  const [pendingAction, setPendingAction] = useState<
    "shuffle" | "add-day" | null
  >(null);

  async function runDraftAction(
    action: Exclude<typeof pendingAction, null>,
    run: () => Promise<unknown>,
  ) {
    if (pendingActionRef.current !== null) return;
    pendingActionRef.current = action;
    setPendingAction(action);
    try {
      await run();
    } finally {
      pendingActionRef.current = null;
      setPendingAction(null);
    }
  }

  if (state.status === "loading") {
    return <PlanReviewLoading />;
  }

  if (state.status === "empty") {
    return mode === "replan" ? (
      <PlanReviewMissingReplan />
    ) : (
      <PlanReviewEmpty onPlanWeek={startPlan} />
    );
  }

  if (state.status === "error") {
    return <PlanReviewError message={state.message} onRetry={retry} />;
  }

  return (
    <PlanReviewReady
      mode={mode}
      summary={state.summary}
      rows={state.rows}
      isSaving={isSaving}
      isShuffling={pendingAction === "shuffle"}
      isAddingDay={pendingAction === "add-day"}
      onSavePlan={() => {
        void savePlan();
      }}
      onPrepareGuestSaveSignIn={prepareGuestSaveSignIn}
      onRemoveMeal={removeMeal}
      onReplaceMeal={replaceMeal}
      onAddDay={() => runDraftAction("add-day", addDay)}
      onTryAnotherWeek={() => runDraftAction("shuffle", tryAnotherWeek)}
    />
  );
}
