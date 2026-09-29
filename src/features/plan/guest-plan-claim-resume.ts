import { savedPlanMealChoices } from "@/features/plan/saved-plan-meal-choices";
import {
  guestDraftMatchesSavedPlan,
  type GuestDraft,
} from "@/lib/domain/guest-draft";

export type GuestPlanClaimResult =
  | { status: "claimed"; mealPlanId: string }
  | { status: "already_claimed"; mealPlanId: string }
  | { status: "catalogue_unsupported" };

export type CurrentPlanForGuestClaim = {
  startDate: string;
  endDate: string;
  mealSlots: Array<{
    date: string;
    catalogueMealId: string | null;
    catalogueVersion: number | null;
  }>;
};

type GuestPlanClaimDependencies = {
  currentPlan: CurrentPlanForGuestClaim | null;
  readDraft: () => Promise<GuestDraft | null>;
  claimDraft: (draft: GuestDraft) => Promise<GuestPlanClaimResult>;
  clearDraft: (draft: GuestDraft) => Promise<boolean>;
  cancelClaim: (draft: GuestDraft) => Promise<void>;
  onSuccessfulClaim: () => void;
  onCleanupFailure: () => void;
  onUnsupportedCatalogue: () => void;
};

export type ResumeGuestPlanClaimStatus =
  | "no_pending_claim"
  | "cleared_completed_claim"
  | "matched_current_plan"
  | "claimed"
  | "already_claimed"
  | "catalogue_unsupported";

export function canResumeGuestPlanClaim({
  isAuthenticated,
  currentPlanResolved,
  hasCatalogue,
  isResuming,
}: {
  isAuthenticated: boolean;
  currentPlanResolved: boolean;
  hasCatalogue: boolean;
  isResuming: boolean;
}): boolean {
  return isAuthenticated && currentPlanResolved && hasCatalogue && !isResuming;
}

function currentPlanMatchesDraft(
  draft: GuestDraft,
  currentPlan: CurrentPlanForGuestClaim,
): boolean {
  return guestDraftMatchesSavedPlan(
    draft,
    savedPlanMealChoices({
      planStartDate: currentPlan.startDate,
      planEndDate: currentPlan.endDate,
      mealSlots: currentPlan.mealSlots,
    }),
  );
}

/**
 * Completes a claim prepared before Clerk sign-in once Convex authentication
 * and the active-plan query are both ready. This is deliberately independent
 * of React, Clerk, and Convex hooks so retry/cleanup policy stays testable.
 */
export async function resumePendingGuestPlanClaim({
  currentPlan,
  readDraft,
  claimDraft,
  clearDraft,
  cancelClaim,
  onSuccessfulClaim,
  onCleanupFailure,
  onUnsupportedCatalogue,
}: GuestPlanClaimDependencies): Promise<ResumeGuestPlanClaimStatus> {
  const draft = await readDraft();
  if (!draft?.acceptedAt || draft.claim === undefined) {
    return "no_pending_claim";
  }

  if (draft.claim.completedAt !== undefined) {
    await clearDraft(draft);
    return "cleared_completed_claim";
  }

  if (currentPlan !== null && currentPlanMatchesDraft(draft, currentPlan)) {
    await clearDraft(draft);
    onSuccessfulClaim();
    return "matched_current_plan";
  }

  const result = await claimDraft(draft);
  switch (result.status) {
    case "claimed":
    case "already_claimed":
      try {
        await clearDraft(draft);
      } catch {
        onCleanupFailure();
      }
      onSuccessfulClaim();
      return result.status;
    case "catalogue_unsupported":
      await cancelClaim(draft);
      onUnsupportedCatalogue();
      return result.status;
  }
}

/** Clear an exact local draft only after a subscribed saved plan confirms it. */
export async function clearHydratedGuestPlanDraft({
  currentPlan,
  readDraft,
  clearDraft,
}: Pick<
  GuestPlanClaimDependencies,
  "currentPlan" | "readDraft" | "clearDraft"
>): Promise<boolean> {
  if (currentPlan === null) return false;

  const draft = await readDraft();
  if (!draft || !currentPlanMatchesDraft(draft, currentPlan)) return false;

  return await clearDraft(draft);
}
