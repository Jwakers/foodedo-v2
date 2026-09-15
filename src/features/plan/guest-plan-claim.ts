"use client";

import { useAuth, useClerk } from "@clerk/react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
  acceptAndPrepareGuestPlanClaim,
  cancelPendingGuestPlanClaim,
  clearClaimedGuestPlanDraft,
  guestPlanClaimMutationArgs,
  readCurrentGuestPlanDraft,
} from "@/features/plan/guest-plan-draft";
import { hasSeenFirstSaveSuccess } from "@/features/plan/plan-lifecycle-prefs";
import {
  addDaysToPlanDate,
  GUEST_PLAN_DAYS,
  guestDraftMatchesSavedPlan,
  type GuestDraftV1,
} from "@/lib/domain/guest-draft";
import { api } from "../../../convex/_generated/api";

type ClaimGuestDraftResult = FunctionReturnType<
  typeof api.mealPlans.claimGuestDraft
>;

/**
 * Save / claim entry for plan review. Guests persist accept + claim key, then
 * open Clerk; signed-in users claim immediately when Convex auth is ready.
 */
export function useSaveGuestPlan() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const { openSignIn } = useClerk();
  const { isAuthenticated, isLoading: isConvexAuthLoading } = useConvexAuth();
  const claimGuestDraft = useMutation(api.mealPlans.claimGuestDraft);
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);

  async function prepareGuestSaveSignIn() {
    if (!isLoaded) {
      throw new Error("Foodedo is still checking your account. Try again.");
    }

    await acceptAndPrepareGuestPlanClaim();
    openSignIn({});
  }

  async function savePlan() {
    if (isSaving) return;

    if (!isLoaded) {
      toast.info("Foodedo is still checking your account. Try again.");
      return;
    }

    setIsSaving(true);
    try {
      const draft = await acceptAndPrepareGuestPlanClaim();

      if (!isSignedIn) {
        openSignIn({});
        return;
      }

      if (isConvexAuthLoading || !isAuthenticated) {
        toast.error(
          "Foodedo couldn’t connect your account yet. Try saving again.",
        );
        return;
      }

      const result = await claimGuestDraft(guestPlanClaimMutationArgs(draft));
      await handleClaimResult(result, {
        router,
        submittedDraft: draft,
        accountId: userId,
      });
    } catch (error) {
      console.error("Failed to save guest plan.", error);
      toast.error(
        error instanceof Error && error.message.startsWith("Save at least")
          ? error.message
          : "Foodedo couldn’t save your plan. Check storage access and try again.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return { isSaving, savePlan, prepareGuestSaveSignIn };
}

/**
 * Resumes a pending guest plan claim after modal or redirect authentication.
 * Mount once at app-shell so any route can finish the save.
 */
export function GuestPlanClaimResume() {
  const { userId } = useAuth();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const claimGuestDraft = useMutation(api.mealPlans.claimGuestDraft);
  const currentPlan = useQuery(
    api.mealPlans.getCurrent,
    isAuthenticated ? {} : "skip",
  );
  const pathname = usePathname();
  const router = useRouter();
  const isResumingRef = useRef(false);
  const didHydrateClearRef = useRef(false);

  useEffect(() => {
    if (
      isLoading ||
      !isAuthenticated ||
      currentPlan === undefined ||
      isResumingRef.current
    ) {
      return;
    }

    isResumingRef.current = true;

    void (async () => {
      try {
        const draft = await readCurrentGuestPlanDraft();
        if (!draft?.acceptedAt || draft.claim === undefined) return;
        if (draft.claim.completedAt !== undefined) {
          await clearClaimedGuestPlanDraft({ expectedDraft: draft });
          return;
        }

        if (currentPlan !== null) {
          const savedChoices = mealChoicesFromActivePlan({
            planStartDate: currentPlan.startDate,
            mealSlots: currentPlan.mealSlots,
          });

          if (guestDraftMatchesSavedPlan(draft, savedChoices)) {
            await clearClaimedGuestPlanDraft({ expectedDraft: draft });
            if (pathname === "/week") {
              navigateAfterSuccessfulClaim(router, userId);
            } else {
              toast.success("Your week is already saved to your account.");
            }
            return;
          }
        }

        // The user explicitly chose to save this exact reviewed week before
        // authentication. Convex atomically archives a different active plan.
        const result = await claimGuestDraft(guestPlanClaimMutationArgs(draft));
        await handleClaimResult(result, {
          router,
          submittedDraft: draft,
          accountId: userId,
        });
      } catch (error) {
        console.error("Failed to resume guest plan claim.", error);
        toast.error(
          "Foodedo couldn’t finish saving your plan. Try saving it again.",
        );
      } finally {
        isResumingRef.current = false;
      }
    })();
  }, [
    claimGuestDraft,
    currentPlan,
    isAuthenticated,
    isLoading,
    pathname,
    router,
    userId,
  ]);

  useEffect(() => {
    didHydrateClearRef.current = false;
  }, [userId]);

  // Matching Convex plan confirms the save across devices; clear local draft.
  useEffect(() => {
    if (
      !isAuthenticated ||
      currentPlan === undefined ||
      currentPlan === null ||
      didHydrateClearRef.current
    ) {
      return;
    }

    void (async () => {
      const draft = await readCurrentGuestPlanDraft();
      if (!draft) return;

      const savedChoices = mealChoicesFromActivePlan({
        planStartDate: currentPlan.startDate,
        mealSlots: currentPlan.mealSlots,
      });

      if (!guestDraftMatchesSavedPlan(draft, savedChoices)) return;

      try {
        didHydrateClearRef.current = await clearClaimedGuestPlanDraft({
          expectedDraft: draft,
        });
      } catch (error) {
        console.error("Failed to clear matching guest plan draft.", error);
      }
    })();
  }, [currentPlan, isAuthenticated]);

  return null;
}

async function handleClaimResult(
  result: ClaimGuestDraftResult,
  {
    router,
    submittedDraft,
    accountId,
  }: {
    router: ReturnType<typeof useRouter>;
    submittedDraft: GuestDraftV1;
    accountId: string | null | undefined;
  },
) {
  switch (result.status) {
    case "claimed":
    case "already_claimed":
      try {
        await clearClaimedGuestPlanDraft({ expectedDraft: submittedDraft });
      } catch (error) {
        console.error("Plan saved, but local draft cleanup failed.", error);
        toast.warning("Your plan was saved.", {
          description:
            "Foodedo couldn’t clear the local copy yet, but your account plan is safe.",
        });
      }
      navigateAfterSuccessfulClaim(router, accountId);
      return;
    case "catalogue_unsupported":
      await cancelPendingGuestPlanClaim({ expectedDraft: submittedDraft });
      toast.error(
        "This plan uses an older recipe catalogue. Plan a new week to continue.",
      );
      return;
    default: {
      const _exhaustive: never = result;
      void _exhaustive;
    }
  }
}

function navigateAfterSuccessfulClaim(
  router: ReturnType<typeof useRouter>,
  accountId: string | null | undefined,
): void {
  if (!hasSeenFirstSaveSuccess(accountId)) {
    router.replace("/week?firstSave=1");
    return;
  }
  router.replace("/week");
}

function mealChoicesFromActivePlan({
  planStartDate,
  mealSlots,
}: {
  planStartDate: string;
  mealSlots: ReadonlyArray<{
    date: string;
    catalogueMealId: string | null;
  }>;
}): Array<{ date: string; catalogueMealId: string | null }> {
  const byDate = new Map(
    mealSlots.map((slot) => [slot.date, slot.catalogueMealId] as const),
  );

  return Array.from({ length: GUEST_PLAN_DAYS }, (_, index) => {
    const date = addDaysToPlanDate(planStartDate, index);
    return {
      date,
      catalogueMealId: byDate.get(date) ?? null,
    };
  });
}
