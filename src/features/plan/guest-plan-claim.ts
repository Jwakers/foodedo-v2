"use client";

import { trackClaimedPlan } from "./plan-save-analytics";
import { pendingInvite } from "@/features/household/invite-continuation";
import { useHouseholdSpace } from "@/features/household/household-context";
import {
  createIndexedDbGuestDraftStore,
  type GuestDraftStore,
} from "@/lib/platform/guest-draft-store";
import type { Id } from "../../../convex/_generated/dataModel";
import { ConvexError } from "convex/values";
import { getDraftSpaceKey } from "@/lib/platform/draft-space";
import { useClerk } from "@clerk/react";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import {
  acceptAndPrepareGuestPlanClaim,
  cancelPendingGuestPlanClaim,
  clearClaimedGuestPlanDraft,
  guestPlanClaimMutationArgs,
  readCurrentGuestPlanDraft,
} from "@/features/plan/guest-plan-draft";
import type { GuestCatalogueContract } from "@/features/plan/guest-plan-draft";
import {
  canResumeGuestPlanClaim,
  clearHydratedGuestPlanDraft,
  type GuestPlanClaimResult,
  resumePendingGuestPlanClaim,
} from "@/features/plan/guest-plan-claim-resume";
import { useGuestDraftCatalogue } from "@/features/plan/use-guest-plan-draft";
import type { GuestDraft } from "@/lib/domain/guest-draft";
import { api } from "../../../convex/_generated/api";
import { useFoodedoAuth } from "@/features/auth/use-foodedo-auth";

/**
 * Save / claim entry for plan review. Guests persist accept + claim key, then
 * open Clerk; signed-in users claim immediately when Convex auth is ready.
 */
export function useSaveGuestPlan() {
  const { spaceArgs } = useHouseholdSpace();
  const { status, isClerkLoaded, isSignedIn, userId } = useFoodedoAuth();
  const { openSignIn } = useClerk();
  const claimGuestDraft = useMutation(api.mealPlans.claimGuestDraft);
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [needsLatestReview, setNeedsLatestReview] = useState(false);
  const { catalogue } = useGuestDraftCatalogue();

  const catalogueContract = useMemo(
    () =>
      catalogue
        ? {
            currentMeals: catalogue.meals.map((meal) => ({
              catalogueMealId: meal.id,
              catalogueVersion: meal.version,
            })),
            readableMeals: catalogue.readableMeals.map((meal) => ({
              catalogueMealId: meal.id,
              catalogueVersion: meal.version,
            })),
          }
        : null,
    [catalogue],
  );

  async function prepareGuestSaveSignIn(expectedDraft?: GuestDraft) {
    if (!isClerkLoaded) {
      throw new Error("Foodedo is still checking your account. Try again.");
    }

    if (!catalogueContract) {
      throw new Error("The recipe catalogue is unavailable. Try again.");
    }

    await acceptAndPrepareGuestPlanClaim({
      catalogue: catalogueContract,
      expectedDraft,
      requestedAsGuest: true,
    });
    openSignIn({});
  }

  async function savePlan(expectedDraft?: GuestDraft) {
    if (isSaving) return;

    if (!isClerkLoaded) {
      toast.info("Foodedo is still checking your account. Try again.");
      return;
    }

    const submittedKey = getDraftSpaceKey();
    const submittedStore = createIndexedDbGuestDraftStore(submittedKey);
    const targetSpace = spaceArgs;
    setIsSaving(true);
    try {
      if (!catalogueContract) {
        throw new Error("The recipe catalogue is unavailable. Try again.");
      }
      const draft = await acceptAndPrepareGuestPlanClaim({
        catalogue: catalogueContract,
        store: submittedStore,
        expectedDraft,
        requestedAsGuest: !isSignedIn,
      });

      if (!isSignedIn) {
        openSignIn({});
        return;
      }

      if (status !== "authenticated") {
        toast.error(
          "Foodedo couldn’t connect your account yet. Try saving again.",
        );
        return;
      }

      const source = draft.reviewSource;
      if (!source || source.spaceKey !== submittedKey) {
        setNeedsLatestReview(true);
        return;
      }
      if (getDraftSpaceKey() !== submittedKey) return;
      const result = await claimGuestDraft({
        ...guestPlanClaimMutationArgs(draft),
        ...targetSpace,
        expectedPlanId: source.planId as Id<"mealPlans"> | null,
        ...(source.updatedAt !== undefined
          ? { expectedUpdatedAt: source.updatedAt }
          : {}),
      });
      trackClaimedPlan(result, draft, userId);
      await handleClaimResult(result, {
        catalogue: catalogueContract,
        router,
        submittedDraft: draft,
        submittedStore,
        submittedKey,
      });
    } catch (error) {
      if (
        error instanceof ConvexError &&
        typeof error.data === "object" &&
        error.data !== null &&
        "code" in error.data &&
        error.data.code === "PLAN_CHANGED"
      ) {
        setNeedsLatestReview(true);
        return;
      }
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

  return { isSaving, savePlan, prepareGuestSaveSignIn, needsLatestReview };
}

/**
 * Resumes a pending guest plan claim after modal or redirect authentication.
 * Mount once at app-shell so any route can finish the save.
 */
export function GuestPlanClaimResume() {
  const { household, ready } = useHouseholdSpace();
  const { userId, isAuthenticated } = useFoodedoAuth();
  const claimGuestDraft = useMutation(api.mealPlans.claimGuestDraft);
  const currentPlan = useQuery(
    api.mealPlans.getCurrent,
    isAuthenticated ? {} : "skip",
  );
  const router = useRouter();
  const isResumingRef = useRef(false);
  const didHydrateClearRef = useRef(false);
  const { catalogue } = useGuestDraftCatalogue("current");
  const catalogueContract = useMemo(
    () =>
      catalogue
        ? {
            currentMeals: catalogue.meals.map((meal) => ({
              catalogueMealId: meal.id,
              catalogueVersion: meal.version,
            })),
            readableMeals: catalogue.readableMeals.map((meal) => ({
              catalogueMealId: meal.id,
              catalogueVersion: meal.version,
            })),
          }
        : null,
    [catalogue],
  );

  useEffect(() => {
    const canResume = canResumeGuestPlanClaim({
      isAuthenticated,
      currentPlanResolved: currentPlan !== undefined,
      hasCatalogue: catalogueContract !== null,
      isResuming: isResumingRef.current,
    });
    if (
      !ready ||
      household ||
      pendingInvite() ||
      window.location.pathname.startsWith("/household") ||
      !canResume ||
      currentPlan === undefined ||
      catalogueContract === null
    ) {
      return;
    }

    isResumingRef.current = true;

    void (async () => {
      try {
        await resumePendingGuestPlanClaim({
          currentPlan,
          readDraft: () =>
            readCurrentGuestPlanDraft(
              catalogueContract,
              createIndexedDbGuestDraftStore("current"),
            ),
          claimDraft: async (draft) => {
            const result = await claimGuestDraft(
              guestPlanClaimMutationArgs(draft),
            );
            trackClaimedPlan(result, draft, userId);
            return result;
          },
          clearDraft: (draft) =>
            clearClaimedGuestPlanDraft({
              catalogue: catalogueContract,
              expectedDraft: draft,
              store: createIndexedDbGuestDraftStore("current"),
            }),
          cancelClaim: (draft) =>
            cancelPendingGuestPlanClaim({
              catalogue: catalogueContract,
              expectedDraft: draft,
              store: createIndexedDbGuestDraftStore("current"),
            }),
          onExistingPlanConfirmed: (draft) => {
            if (currentPlan)
              trackClaimedPlan(
                { status: "already_claimed", mealPlanId: currentPlan._id },
                draft,
                userId,
              );
          },
          onSuccessfulClaim: () => navigateAfterSuccessfulClaim(router),
          onCleanupFailure: () => {
            toast.warning("Your plan was saved.", {
              description:
                "Foodedo couldn’t clear the local copy yet, but your account plan is safe.",
            });
          },
          onUnsupportedCatalogue: () => {
            toast.error(
              "This plan uses an older recipe catalogue. Plan a new week to continue.",
            );
          },
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
    ready,
    household,
    catalogueContract,
    claimGuestDraft,
    currentPlan,
    isAuthenticated,
    userId,
    router,
  ]);

  useEffect(() => {
    didHydrateClearRef.current = false;
  }, [userId]);

  // Matching Convex plan confirms the save across devices; clear local draft.
  useEffect(() => {
    if (
      !isAuthenticated ||
      !ready ||
      !!household ||
      !!pendingInvite() ||
      window.location.pathname.startsWith("/household") ||
      currentPlan === undefined ||
      currentPlan === null ||
      catalogueContract === null ||
      didHydrateClearRef.current
    ) {
      return;
    }

    void (async () => {
      try {
        didHydrateClearRef.current = await clearHydratedGuestPlanDraft({
          currentPlan,
          readDraft: () =>
            readCurrentGuestPlanDraft(
              catalogueContract,
              createIndexedDbGuestDraftStore("current"),
            ),
          clearDraft: (draft) => {
            if (draft.acceptedAt && draft.claim)
              trackClaimedPlan(
                { status: "already_claimed", mealPlanId: currentPlan._id },
                draft,
                userId,
              );
            return clearClaimedGuestPlanDraft({
              catalogue: catalogueContract,
              expectedDraft: draft,
              store: createIndexedDbGuestDraftStore("current"),
            });
          },
        });
      } catch (error) {
        console.error("Failed to clear matching guest plan draft.", error);
      }
    })();
  }, [
    catalogueContract,
    currentPlan,
    isAuthenticated,
    ready,
    household,
    userId,
  ]);

  return null;
}

async function handleClaimResult(
  result: GuestPlanClaimResult,
  {
    catalogue,
    router,
    submittedDraft,
    submittedStore,
    submittedKey,
  }: {
    catalogue: GuestCatalogueContract;
    router: ReturnType<typeof useRouter>;
    submittedDraft: GuestDraft;
    submittedStore: GuestDraftStore;
    submittedKey: string;
  },
) {
  switch (result.status) {
    case "claimed":
    case "already_claimed":
      try {
        await clearClaimedGuestPlanDraft({
          catalogue,
          expectedDraft: submittedDraft,
          store: submittedStore,
        });
      } catch (error) {
        console.error("Plan saved, but local draft cleanup failed.", error);
        toast.warning("Your plan was saved.", {
          description:
            "Foodedo couldn’t clear the local copy yet, but your account plan is safe.",
        });
      }
      if (getDraftSpaceKey() === submittedKey)
        navigateAfterSuccessfulClaim(router);
      return;
    case "catalogue_unsupported":
      await cancelPendingGuestPlanClaim({
        catalogue,
        expectedDraft: submittedDraft,
        store: submittedStore,
      });
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
): void {
  router.replace("/week/saved");
}
