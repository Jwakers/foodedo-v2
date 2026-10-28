import { trackPlanSaved } from "@/lib/analytics";
import type { GuestDraft } from "@/lib/domain/guest-draft";
import type { GuestPlanClaimResult } from "./guest-plan-claim-resume";

/** Track only confirmed saves; local origin metadata survives sign-in and retries. */
export function trackClaimedPlan(
  result: GuestPlanClaimResult,
  draft: GuestDraft,
  userId: string | null | undefined,
) {
  if (result.status !== "claimed" && result.status !== "already_claimed")
    return;
  trackPlanSaved(
    result.mealPlanId,
    {
      ...(typeof draft.claim?.requestedAsGuest === "boolean"
        ? { is_guest_claim: draft.claim.requestedAsGuest }
        : {}),
      meal_count: draft.mealChoices.filter(
        (meal) => meal.catalogueMealId !== null,
      ).length,
    },
    userId,
  );
}
