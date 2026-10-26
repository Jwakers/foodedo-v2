"use client";

import { useMutation, useQuery } from "convex/react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import { AccountConnectionError } from "@/components/account-connection-error";
import { ButtonLink } from "@/components/ui/button";
import { useFoodedoAuth } from "@/features/auth/use-foodedo-auth";
import { useHouseholdSpace } from "@/features/household/household-context";
import { useOnboarding } from "@/features/onboarding/use-onboarding";
import {
  useCatalogueMeals,
  useCurrentCatalogue,
} from "@/features/recipes/use-catalogue";
import { getDraftSpaceKey } from "@/lib/platform/draft-space";
import { catalogueMealReferenceKey } from "@/lib/domain/recipes";
import {
  beginConfiguredGuestPlanDraft,
  beginGuestPlanDraftWithMeal,
  beginNextGuestPlanDraft,
} from "./guest-plan-draft";
import { PlanReviewLoading } from "./plan-review-loading";
import { PlanSetupForm } from "./plan-setup-form";
import type { PrePlanSetup } from "./pre-plan-setup-store";
import { bindReviewSource } from "./review-source";
import { fallbackPrePlanSetup, usePrePlanSetup } from "./use-pre-plan-setup";

export function PlanSetupRoute() {
  const params = useSearchParams();
  return (
    <PlanSetupPage
      next={params.get("mode") === "next"}
      firstMeal={params.get("meal")}
      firstVersion={Number(params.get("version"))}
    />
  );
}

export function PlanSetupPage({
  onPlanCreated,
  next = false,
  firstMeal = null,
  firstVersion = 0,
}: {
  onPlanCreated?: () => Promise<unknown>;
  next?: boolean;
  firstMeal?: string | null;
  firstVersion?: number;
}) {
  const router = useRouter();
  const { status, isAuthenticated } = useFoodedoAuth();
  const { spaceArgs, spaceKey, isHousehold, ready } = useHouseholdSpace();
  const { retire } = useOnboarding();
  const current = useQuery(
    api.mealPlans.getCurrent,
    isAuthenticated && ready ? spaceArgs : "skip",
  );
  const preferences = useQuery(
    api.planningPreferences.getCurrent,
    isAuthenticated ? {} : "skip",
  );
  const signals = useQuery(
    api.mealPlans.getCatalogueSelectionSignals,
    isAuthenticated && ready ? spaceArgs : "skip",
  );
  const history = useQuery(
    api.mealPlans.getRecentCatalogueSelectionHistory,
    isAuthenticated && ready ? spaceArgs : "skip",
  );
  const updateUsual = useMutation(api.planningPreferences.updateUsual);
  const catalogue = useCurrentCatalogue();
  const pinnedReferences =
    firstMeal && Number.isInteger(firstVersion) && firstVersion > 0
      ? [{ catalogueMealId: firstMeal, catalogueVersion: firstVersion }]
      : [];
  const pinned = useCatalogueMeals(
    pinnedReferences.length ? pinnedReferences : null,
  );
  const { setup, applySetup } = usePrePlanSetup(
    fallbackPrePlanSetup(preferences),
  );

  if (status === "connection_error") return <AccountConnectionError />;
  if (
    status === "loading" ||
    !ready ||
    catalogue === undefined ||
    (pinnedReferences.length > 0 && pinned === undefined) ||
    (isAuthenticated &&
      (current === undefined ||
        preferences === undefined ||
        signals === undefined ||
        history === undefined))
  ) {
    return <PlanReviewLoading />;
  }
  if (
    !catalogue ||
    catalogue.meals.length === 0 ||
    (firstMeal && !pinned?.length)
  ) {
    return (
      <main className="mx-auto max-w-175 px-page-inline py-7">
        <h1 className="font-display text-30 font-semibold">
          Recipes are temporarily unavailable
        </h1>
        <p className="mt-2 text-15 text-graphite">
          Return to Week and try again shortly.
        </p>
        <ButtonLink href="/week" className="mt-5">
          Return to Week
        </ButtonLink>
      </main>
    );
  }
  const initialSetup: PrePlanSetup = next
    ? fallbackPrePlanSetup(preferences)
    : setup;

  async function generate(values: PrePlanSetup, remember: boolean) {
    const generationKey = getDraftSpaceKey();
    try {
      if (remember) {
        await updateUsual({
          ...(values.planDays !== initialSetup.planDays
            ? { usualPlanDays: values.planDays }
            : {}),
          ...(values.servings !== initialSetup.servings
            ? { usualServings: values.servings }
            : {}),
          ...(values.prioritiseSavedRecipes !==
          initialSetup.prioritiseSavedRecipes
            ? { prioritiseSavedRecipes: values.prioritiseSavedRecipes }
            : {}),
        });
      }
      // A household switch during an awaited preference save must not write a
      // draft under the newly selected household's storage key.
      if (getDraftSpaceKey() !== generationKey) return;
      const signalsById = new Map(
        (signals ?? []).map((signal) => [signal.catalogueMealId, signal]),
      );
      const meals = catalogue!.meals.map((meal) => {
        const signal = signalsById.get(meal.id);
        return {
          catalogueMealId: meal.id,
          catalogueVersion: meal.version,
          proteinCategory: meal.proteinCategory,
          isSaved: values.prioritiseSavedRecipes && (signal?.isSaved ?? false),
          savedByMemberKeys: values.prioritiseSavedRecipes
            ? signal?.savedByMemberKeys
            : [],
          dismissalCount: signal?.dismissalCount,
        };
      });
      const readableMeals = [
        ...meals,
        ...(pinned ?? []).map((meal) => ({
          catalogueMealId: meal.id,
          catalogueVersion: meal.version,
          proteinCategory: meal.proteinCategory,
        })),
      ];
      const contract = {
        currentMeals: meals,
        readableMeals: [
          ...new Map(
            readableMeals.map((meal) => [
              catalogueMealReferenceKey(meal),
              meal,
            ]),
          ).values(),
        ],
      };
      const options = {
        catalogue: contract,
        reviewSource: isAuthenticated
          ? bindReviewSource(current ?? null)
          : undefined,
        planStartDate: values.startDate,
        planDays: values.planDays,
        servings: values.servings,
        selectionSignals: signals ?? [],
        preferredCatalogueMealIds: values.prioritiseSavedRecipes
          ? (signals ?? [])
              .filter((meal) => meal.isSaved)
              .map((meal) => meal.catalogueMealId)
          : [],
        recentPlanMealIds: history ?? [],
      };
      if (firstMeal) {
        await beginGuestPlanDraftWithMeal({
          ...options,
          catalogueMealId: firstMeal,
          catalogueVersion: firstVersion,
        });
      } else if (next) {
        await beginNextGuestPlanDraft(options);
      } else {
        await beginConfiguredGuestPlanDraft(options);
      }
      if (getDraftSpaceKey() !== generationKey) return;
      applySetup(values);
      retire("home");
      if (onPlanCreated) await onPlanCreated();
      else router.replace(current ? "/week/new" : "/week");
    } catch (error) {
      console.error("Failed to generate the configured plan.", error);
      toast.error(
        "Foodedo couldn’t start your week. Check your connection and try again.",
      );
    }
  }

  return (
    <PlanSetupForm
      key={`${spaceKey}:${next}`}
      initialSetup={initialSetup}
      title={next ? "Plan your next week" : "Plan your week"}
      description={
        next
          ? "Your current week stays in place until you save the next one."
          : "Choose the days you need. Foodedo will suggest the meals."
      }
      canRemember={isAuthenticated}
      showSavedRecipes={isAuthenticated}
      isHousehold={isHousehold}
      onGenerate={generate}
    />
  );
}
