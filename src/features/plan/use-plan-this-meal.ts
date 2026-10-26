"use client";

import type { Id } from "../../../convex/_generated/dataModel";
import { useHouseholdSpace } from "@/features/household/household-context";

import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { api } from "../../../convex/_generated/api";
import { useFoodedoAuth } from "@/features/auth/use-foodedo-auth";
import {
  extendCurrentGuestPlanDraft,
  readCurrentGuestPlanDraft,
  replaceGuestPlanMeal,
} from "@/features/plan/guest-plan-draft";
import {
  guestCatalogueMealsByReference,
  toGuestCatalogueContract,
  useGuestDraftCatalogue,
} from "@/features/plan/use-guest-plan-draft";
import { addDaysToPlanDate, type GuestDraftV1 } from "@/lib/domain/guest-draft";
import {
  nextPlanDay,
  planMealOptions,
  type PlanThisMealDay,
} from "@/lib/domain/plan-this-meal";
import {
  catalogueMealReferenceKey,
  type CatalogueMealSummary,
} from "@/lib/domain/recipes";

type PlannerTarget =
  | {
      kind: "saved";
      mealPlanId: Id<"mealPlans">;
      expectedUpdatedAt: number;
    }
  | {
      kind: "draft";
      draft: GuestDraftV1;
      reviewPath: "/week" | "/week/new";
    };

/**
 * Recipe detail uses the saved active plan, then a local draft, regardless of
 * their date ranges. Without either, start setup with this meal selected.
 */
export function usePlanThisMeal({
  catalogueMealId,
  catalogueVersion,
}: {
  catalogueMealId: string;
  catalogueVersion: number;
}) {
  const { spaceArgs, ready: spaceReady } = useHouseholdSpace();
  const router = useRouter();
  const { status, isAuthenticated } = useFoodedoAuth();
  const currentPlan = useQuery(
    api.mealPlans.getCurrent,
    isAuthenticated && spaceReady ? spaceArgs : "skip",
  );
  const preferences = useQuery(
    api.planningPreferences.getCurrent,
    isAuthenticated ? {} : "skip",
  );
  const savedCatalogueMeals = useQuery(
    api.mealPlans.getCatalogueSelectionSignals,
    isAuthenticated && spaceReady ? spaceArgs : "skip",
  );
  const planSavedMeal = useMutation(api.mealPlans.planMeal);
  const addSavedPlanDay = useMutation(api.mealPlans.addPlanDay);
  const { catalogue: draftCatalogue, refreshStoredReferences } =
    useGuestDraftCatalogue();
  const [target, setTarget] = useState<PlannerTarget | null>(null);
  const [pending, setPending] = useState<
    | { kind: "opening" }
    | { kind: "planning"; date: string }
    | { kind: "adding" }
    | null
  >(null);
  const mealsByReference = useMemo(
    () => guestCatalogueMealsByReference(draftCatalogue),
    [draftCatalogue],
  );
  const guestCatalogue = useMemo(
    () => (draftCatalogue ? toGuestCatalogueContract(draftCatalogue) : null),
    [draftCatalogue],
  );

  const isReady =
    (status === "guest" || status === "authenticated") &&
    guestCatalogue !== null &&
    (!isAuthenticated ||
      (currentPlan !== undefined &&
        preferences !== undefined &&
        savedCatalogueMeals !== undefined));

  let days: PlanThisMealDay[] = [];
  if (target?.kind === "saved" && currentPlan) {
    days = savedPlanDays(currentPlan);
  } else if (target?.kind === "draft") {
    days = draftPlanDays(target.draft, mealsByReference);
  }
  const nextPlanDate =
    target?.kind === "saved" && currentPlan
      ? nextPlanDay(currentPlan)
      : target?.kind === "draft"
        ? nextPlanDay({
            startDate: target.draft.planStartDate,
            endDate: addDaysToPlanDate(
              target.draft.planStartDate,
              target.draft.planDays - 1,
            ),
          })
        : null;

  function handleSavedPlanFailure(
    status:
      | "plan_changed"
      | "no_active_plan"
      | "plan_full"
      | "plan_unavailable"
      | "catalogue_unsupported",
  ) {
    switch (status) {
      case "plan_changed":
        toast.info("Your plan just changed.", {
          description: "Check the meals and try again.",
        });
        return;
      case "no_active_plan":
        toast.info("You no longer have an active plan.");
        setTarget(null);
        return;
      case "plan_full":
        toast.info("This plan already has seven meal slots.");
        return;
      case "plan_unavailable":
        toast.error("This plan can’t be updated right now.", {
          description: "Open Week to review your active plan.",
        });
        return;
      case "catalogue_unsupported":
        toast.error("This recipe can’t be planned right now.");
    }
  }

  function startWeek() {
    const params = new URLSearchParams({
      meal: catalogueMealId,
      version: String(catalogueVersion),
    });
    router.push(`/week/setup?${params}`);
  }

  async function openPlanner() {
    if (!isReady || pending !== null) return;
    if (guestCatalogue === null) {
      toast.error("This recipe can’t be planned right now.");
      return;
    }

    const hasSavedPlan = isAuthenticated && Boolean(currentPlan);
    const reviewPath = hasSavedPlan ? "/week/new" : "/week";
    if (currentPlan?.hasActivePlanConflict) {
      toast.info("Resolve your active plan conflict first.", {
        description: "Open Week and choose which plan to keep.",
      });
      return;
    }
    setPending({ kind: "opening" });
    try {
      if (currentPlan) {
        setTarget({
          kind: "saved",
          mealPlanId: currentPlan._id,
          expectedUpdatedAt: currentPlan.updatedAt,
        });
        return;
      }
      const draft = await readCurrentGuestPlanDraft(guestCatalogue);
      if (draft) {
        setTarget({ kind: "draft", draft, reviewPath });
        return;
      }
      startWeek();
    } catch (error) {
      console.error("Failed to open Plan this meal.", error);
      toast.error(
        "Foodedo couldn’t open your plan. Check storage access and try again.",
      );
    } finally {
      setPending(null);
    }
  }

  async function planOnDate(date: string) {
    if (target === null || pending !== null) {
      return;
    }

    setPending({ kind: "planning", date });
    try {
      let viewPath: "/week" | "/week/new" = "/week";
      if (target.kind === "saved") {
        if (!currentPlan) {
          toast.info("You no longer have an active plan.");
          setTarget(null);
          return;
        }
        const result = await planSavedMeal({
          ...spaceArgs,
          mealPlanId: target.mealPlanId,
          expectedUpdatedAt: target.expectedUpdatedAt,
          date,
          catalogueMealId,
          catalogueVersion,
        });
        if (result.status !== "planned") {
          handleSavedPlanFailure(result.status);
          return;
        }
      } else {
        if (guestCatalogue === null) {
          throw new Error("The catalogue is unavailable.");
        }
        await replaceGuestPlanMeal({
          catalogue: guestCatalogue,
          date,
          catalogueMealId,
          catalogueVersion,
        });
        await refreshStoredReferences();
        viewPath = target.reviewPath;
      }

      setTarget(null);
      toast.success("Meal added to your plan", {
        action: { label: "View plan", onClick: () => router.push(viewPath) },
      });
    } catch (error) {
      console.error("Failed to plan this meal.", error);
      toast.error(
        target.kind === "saved"
          ? "Foodedo couldn’t update your plan. Try again."
          : "Foodedo couldn’t update your plan. Check storage access and try again.",
      );
    } finally {
      setPending(null);
    }
  }

  async function addDay() {
    if (target === null || pending !== null || nextPlanDate === null) {
      return;
    }

    setPending({ kind: "adding" });
    try {
      let viewPath: "/week" | "/week/new" = "/week";
      if (target.kind === "saved") {
        if (!currentPlan) {
          toast.info("You no longer have an active plan.");
          setTarget(null);
          return;
        }
        const result = await addSavedPlanDay({
          ...spaceArgs,
          mealPlanId: target.mealPlanId,
          expectedUpdatedAt: target.expectedUpdatedAt,
          catalogueMealId,
          catalogueVersion,
        });
        if (result.status !== "planned") {
          handleSavedPlanFailure(result.status);
          return;
        }
      } else {
        if (guestCatalogue === null) {
          throw new Error("The catalogue is unavailable.");
        }
        await extendCurrentGuestPlanDraft({
          catalogue: guestCatalogue,
          catalogueMealId,
          catalogueVersion,
        });
        await refreshStoredReferences();
        viewPath = target.reviewPath;
      }

      setTarget(null);
      toast.success("Meal added to your plan", {
        action: { label: "View plan", onClick: () => router.push(viewPath) },
      });
    } catch (error) {
      console.error("Failed to add a day for this meal.", error);
      toast.error(
        target.kind === "saved"
          ? "Foodedo couldn’t update your plan. Try again."
          : "Foodedo couldn’t update your plan. Check storage access and try again.",
      );
    } finally {
      setPending(null);
    }
  }

  return {
    isReady,
    isOpening: pending?.kind === "opening",
    planningDate: pending?.kind === "planning" ? pending.date : null,
    isOpen: target !== null,
    days,
    nextPlanDate,
    isAddingDay: pending?.kind === "adding",
    openPlanner,
    planOnDate,
    addDay,
    closePlanner: () => {
      if (pending?.kind !== "planning" && pending?.kind !== "adding") {
        setTarget(null);
      }
    },
  };
}

function savedPlanDays(plan: {
  startDate: string;
  endDate: string;
  mealSlots: ReadonlyArray<{
    date: string;
    catalogueMealId: string | null;
    title: string;
  }>;
}) {
  return planMealOptions({
    startDate: plan.startDate,
    endDate: plan.endDate,
    slots: plan.mealSlots,
  });
}

function draftPlanDays(
  draft: GuestDraftV1,
  mealsByReference: ReadonlyMap<string, CatalogueMealSummary>,
) {
  return planMealOptions({
    startDate: draft.planStartDate,
    endDate: addDaysToPlanDate(draft.planStartDate, draft.planDays - 1),
    slots: draft.mealChoices.flatMap((choice) =>
      choice.catalogueMealId === null || choice.catalogueVersion === null
        ? []
        : [
            {
              date: choice.date,
              catalogueMealId: choice.catalogueMealId,
              title:
                mealsByReference.get(
                  catalogueMealReferenceKey({
                    catalogueMealId: choice.catalogueMealId,
                    catalogueVersion: choice.catalogueVersion,
                  }),
                )?.title ?? "Planned meal",
            },
          ],
    ),
  });
}
