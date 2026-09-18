"use client";

import { useClerk } from "@clerk/react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
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
import { savedPlanMealChoices } from "@/features/plan/saved-plan-meal-choices";
import { useGuestDraftCatalogue } from "@/features/plan/use-guest-plan-draft";
import {
  guestDraftMatchesSavedPlan,
  type GuestDraftV1,
} from "@/lib/domain/guest-draft";
import { api } from "../../../convex/_generated/api";
import { useFoodedoAuth } from "@/features/auth/use-foodedo-auth";

type ClaimGuestDraftResult = FunctionReturnType<
  typeof api.mealPlans.claimGuestDraft
>;

/**
 * Save / claim entry for plan review. Guests persist accept + claim key, then
 * open Clerk; signed-in users claim immediately when Convex auth is ready.
 */
export function useSaveGuestPlan() {
  const { status, isClerkLoaded, isSignedIn } = useFoodedoAuth();
  const { openSignIn } = useClerk();
  const claimGuestDraft = useMutation(api.mealPlans.claimGuestDraft);
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
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

  async function prepareGuestSaveSignIn() {
    if (!isClerkLoaded) {
      throw new Error("Foodedo is still checking your account. Try again.");
    }

    if (!catalogueContract) {
      throw new Error("The recipe catalogue is unavailable. Try again.");
    }

    await acceptAndPrepareGuestPlanClaim({ catalogue: catalogueContract });
    openSignIn({});
  }

  async function savePlan() {
    if (isSaving) return;

    if (!isClerkLoaded) {
      toast.info("Foodedo is still checking your account. Try again.");
      return;
    }

    setIsSaving(true);
    try {
      if (!catalogueContract) {
        throw new Error("The recipe catalogue is unavailable. Try again.");
      }
      const draft = await acceptAndPrepareGuestPlanClaim({
        catalogue: catalogueContract,
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

      const result = await claimGuestDraft(guestPlanClaimMutationArgs(draft));
      await handleClaimResult(result, {
        catalogue: catalogueContract,
        router,
        submittedDraft: draft,
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
  const { status, userId, isAuthenticated } = useFoodedoAuth();
  const claimGuestDraft = useMutation(api.mealPlans.claimGuestDraft);
  const currentPlan = useQuery(
    api.mealPlans.getCurrent,
    isAuthenticated ? {} : "skip",
  );
  const router = useRouter();
  const isResumingRef = useRef(false);
  const didHydrateClearRef = useRef(false);
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

  useEffect(() => {
    if (
      status === "loading" ||
      !isAuthenticated ||
      currentPlan === undefined ||
      catalogueContract === null ||
      isResumingRef.current
    ) {
      return;
    }

    isResumingRef.current = true;

    void (async () => {
      try {
        const draft = await readCurrentGuestPlanDraft(catalogueContract);
        if (!draft?.acceptedAt || draft.claim === undefined) return;
        if (draft.claim.completedAt !== undefined) {
          await clearClaimedGuestPlanDraft({
            catalogue: catalogueContract,
            expectedDraft: draft,
          });
          return;
        }

        if (currentPlan !== null) {
          const savedChoices = savedPlanMealChoices({
            planStartDate: currentPlan.startDate,
            planEndDate: currentPlan.endDate,
            mealSlots: currentPlan.mealSlots,
          });

          if (guestDraftMatchesSavedPlan(draft, savedChoices)) {
            await clearClaimedGuestPlanDraft({
              catalogue: catalogueContract,
              expectedDraft: draft,
            });
            navigateAfterSuccessfulClaim(router);
            return;
          }
        }

        // The user explicitly chose to save this exact reviewed week before
        // authentication. Convex atomically archives a different active plan.
        const result = await claimGuestDraft(guestPlanClaimMutationArgs(draft));
        await handleClaimResult(result, {
          catalogue: catalogueContract,
          router,
          submittedDraft: draft,
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
    catalogueContract,
    claimGuestDraft,
    currentPlan,
    isAuthenticated,
    status,
    router,
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
      catalogueContract === null ||
      didHydrateClearRef.current
    ) {
      return;
    }

    void (async () => {
      const draft = await readCurrentGuestPlanDraft(catalogueContract);
      if (!draft) return;

      const savedChoices = savedPlanMealChoices({
        planStartDate: currentPlan.startDate,
        planEndDate: currentPlan.endDate,
        mealSlots: currentPlan.mealSlots,
      });

      if (!guestDraftMatchesSavedPlan(draft, savedChoices)) return;

      try {
        didHydrateClearRef.current = await clearClaimedGuestPlanDraft({
          catalogue: catalogueContract,
          expectedDraft: draft,
        });
      } catch (error) {
        console.error("Failed to clear matching guest plan draft.", error);
      }
    })();
  }, [catalogueContract, currentPlan, isAuthenticated]);

  return null;
}

async function handleClaimResult(
  result: ClaimGuestDraftResult,
  {
    catalogue,
    router,
    submittedDraft,
  }: {
    catalogue: GuestCatalogueContract;
    router: ReturnType<typeof useRouter>;
    submittedDraft: GuestDraftV1;
  },
) {
  switch (result.status) {
    case "claimed":
    case "already_claimed":
      try {
        await clearClaimedGuestPlanDraft({
          catalogue,
          expectedDraft: submittedDraft,
        });
      } catch (error) {
        console.error("Plan saved, but local draft cleanup failed.", error);
        toast.warning("Your plan was saved.", {
          description:
            "Foodedo couldn’t clear the local copy yet, but your account plan is safe.",
        });
      }
      navigateAfterSuccessfulClaim(router);
      return;
    case "catalogue_unsupported":
      await cancelPendingGuestPlanClaim({
        catalogue,
        expectedDraft: submittedDraft,
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
