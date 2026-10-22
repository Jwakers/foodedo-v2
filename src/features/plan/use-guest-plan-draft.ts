"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useFoodedoAuth } from "@/features/auth/use-foodedo-auth";
import { useHouseholdSpace } from "@/features/household/household-context";
import { fallbackPrePlanSetup, usePrePlanSetup } from "./use-pre-plan-setup";
import type { MealPreferenceSignals } from "@/lib/domain/meal-selection-signals";
import { createIndexedDbGuestDraftStore } from "@/lib/platform/guest-draft-store";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  chooseGuestPlanMealForDate,
  ensureGuestPlanDraft,
  extendCurrentGuestPlanDraft,
  loadGuestPlanDraftForReview,
  readStoredGuestPlanDraftMealReferences,
  removeGuestPlanMeal,
  replaceGuestPlanMeal,
  shuffleCurrentGuestPlanDraft,
  type GuestCatalogueContract,
} from "@/features/plan/guest-plan-draft";
import {
  useCatalogueMeals,
  useCurrentCatalogue,
} from "@/features/recipes/use-catalogue";
import type { GuestDraft } from "@/lib/domain/guest-draft";
import {
  catalogueMealReferenceKey,
  type CatalogueMealSummary,
} from "@/lib/domain/recipes";
import {
  resolveGuestPlanMealRows,
  summarizeGuestPlanDraft,
  type GuestPlanMealRow,
} from "@/lib/domain/plan-display";

const loadErrorMessage =
  "Foodedo couldn’t open your plan on this device. Check storage access and try again.";

export type GuestPlanDraftState =
  | { status: "loading" }
  | { status: "empty" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      draft: GuestDraft;
      rows: GuestPlanMealRow[];
      summary: string;
    };

type GuestDraftCatalogueSelection = {
  meals: (CatalogueMealSummary &
    MealPreferenceSignals & { isSaved?: boolean })[];
  readableMeals: CatalogueMealSummary[];
};

export function toGuestCatalogueContract(
  selection: GuestDraftCatalogueSelection,
): GuestCatalogueContract {
  return {
    currentMeals: selection.meals.map((meal) => ({
      catalogueMealId: meal.id,
      catalogueVersion: meal.version,
      proteinCategory: meal.proteinCategory,
      isSaved: meal.isSaved,
      savedByMemberKeys: meal.savedByMemberKeys,
      dismissalCount: meal.dismissalCount,
    })),
    readableMeals: selection.readableMeals.map((meal) => ({
      catalogueMealId: meal.id,
      catalogueVersion: meal.version,
      proteinCategory: meal.proteinCategory,
    })),
  };
}

export function guestCatalogueMealsByReference(
  selection: GuestDraftCatalogueSelection | null | undefined,
): ReadonlyMap<string, CatalogueMealSummary> {
  return new Map(
    selection?.readableMeals.map(
      (meal) =>
        [
          catalogueMealReferenceKey({
            catalogueMealId: meal.id,
            catalogueVersion: meal.version,
          }),
          meal,
        ] as const,
    ) ?? [],
  );
}

function toReadyState(
  draft: GuestDraft,
  mealsByReference: ReadonlyMap<string, CatalogueMealSummary>,
): Extract<GuestPlanDraftState, { status: "ready" }> {
  return {
    status: "ready",
    draft,
    rows: resolveGuestPlanMealRows({ draft, mealsByReference }),
    summary: summarizeGuestPlanDraft(draft),
  };
}

async function readDraftState(
  catalogue: Parameters<typeof loadGuestPlanDraftForReview>[0],
  mealsByReference: Parameters<typeof toReadyState>[1],
): Promise<Exclude<GuestPlanDraftState, { status: "loading" }>> {
  try {
    const draft = await loadGuestPlanDraftForReview(catalogue);
    if (!draft) return { status: "empty" };
    return toReadyState(draft, mealsByReference);
  } catch (error) {
    console.error("Failed to read guest plan draft.", error);
    return { status: "error", message: loadErrorMessage };
  }
}

export function useGuestPlanDraft() {
  const { catalogue: selectedCatalogue, refreshStoredReferences } =
    useGuestDraftCatalogue();
  const catalogue = useMemo(
    () =>
      selectedCatalogue ? toGuestCatalogueContract(selectedCatalogue) : null,
    [selectedCatalogue],
  );
  const mealsByReference = useMemo(
    () => guestCatalogueMealsByReference(selectedCatalogue),
    [selectedCatalogue],
  );
  const [state, setState] = useState<GuestPlanDraftState>({
    status: "loading",
  });

  useEffect(() => {
    if (catalogue === null) return;
    let cancelled = false;

    void (async () => {
      const next = await readDraftState(catalogue, mealsByReference);
      if (!cancelled) setState(next);
    })();

    return () => {
      cancelled = true;
    };
  }, [catalogue, mealsByReference]);

  const retry = useCallback(async () => {
    if (catalogue === null) return;
    setState({ status: "loading" });
    setState(await readDraftState(catalogue, mealsByReference));
  }, [catalogue, mealsByReference]);

  const startPlan = useCallback(async () => {
    if (catalogue === null) throw new Error("The catalogue is unavailable.");
    const draft = await ensureGuestPlanDraft({ catalogue });
    await refreshStoredReferences();
    setState(toReadyState(draft, mealsByReference));
    return draft;
  }, [catalogue, mealsByReference, refreshStoredReferences]);

  const tryAnotherWeek = useCallback(async () => {
    if (catalogue === null) throw new Error("The catalogue is unavailable.");
    const draft = await shuffleCurrentGuestPlanDraft({ catalogue });
    await refreshStoredReferences();
    setState(toReadyState(draft, mealsByReference));
    return draft;
  }, [catalogue, mealsByReference, refreshStoredReferences]);

  const removeMeal = useCallback(
    async (date: string) => {
      if (catalogue === null) throw new Error("The catalogue is unavailable.");
      const draft = await removeGuestPlanMeal({ catalogue, date });
      await refreshStoredReferences();
      setState(toReadyState(draft, mealsByReference));
      return draft;
    },
    [catalogue, mealsByReference, refreshStoredReferences],
  );

  const replaceMeal = useCallback(
    async (date: string, catalogueMealId: string) => {
      if (catalogue === null) throw new Error("The catalogue is unavailable.");
      const draft = await replaceGuestPlanMeal({
        catalogue,
        date,
        catalogueMealId,
      });
      await refreshStoredReferences();
      setState(toReadyState(draft, mealsByReference));
      return draft;
    },
    [catalogue, mealsByReference, refreshStoredReferences],
  );

  const chooseMeal = useCallback(
    async (date: string) => {
      if (catalogue === null) throw new Error("The catalogue is unavailable.");
      const draft = await chooseGuestPlanMealForDate({ catalogue, date });
      await refreshStoredReferences();
      setState(toReadyState(draft, mealsByReference));
      return draft;
    },
    [catalogue, mealsByReference, refreshStoredReferences],
  );

  const addDay = useCallback(async () => {
    if (catalogue === null) throw new Error("The catalogue is unavailable.");
    const draft = await extendCurrentGuestPlanDraft({ catalogue });
    await refreshStoredReferences();
    setState(toReadyState(draft, mealsByReference));
    return draft;
  }, [catalogue, mealsByReference, refreshStoredReferences]);

  return {
    state,
    retry,
    startPlan,
    tryAnotherWeek,
    removeMeal,
    replaceMeal,
    chooseMeal,
    addDay,
  };
}

export function useGuestDraftCatalogue(storeKey?: string): {
  catalogue: GuestDraftCatalogueSelection | null | undefined;
  refreshStoredReferences: () => Promise<void>;
} {
  const currentCatalogue = useCurrentCatalogue();
  const { isAuthenticated } = useFoodedoAuth();
  const { spaceArgs, ready: spaceReady } = useHouseholdSpace();
  const selectionSignals = useQuery(
    api.mealPlans.getCatalogueSelectionSignals,
    isAuthenticated && spaceReady ? spaceArgs : "skip",
  );
  const preferences = useQuery(
    api.planningPreferences.getCurrent,
    isAuthenticated ? {} : "skip",
  );
  const { setup } = usePrePlanSetup(fallbackPrePlanSetup(preferences));

  const [storedReferences, setStoredReferences] = useState<
    | Awaited<ReturnType<typeof readStoredGuestPlanDraftMealReferences>>
    | undefined
  >(undefined);

  const refreshStoredReferences = useCallback(async () => {
    try {
      setStoredReferences(
        await readStoredGuestPlanDraftMealReferences(
          createIndexedDbGuestDraftStore(storeKey),
        ),
      );
    } catch (error) {
      console.error("Failed to inspect the guest plan draft.", error);
      setStoredReferences(null);
    }
  }, [storeKey]);

  useEffect(() => {
    let cancelled = false;
    void readStoredGuestPlanDraftMealReferences(
      createIndexedDbGuestDraftStore(storeKey),
    )
      .then((references) => {
        if (!cancelled) setStoredReferences(references);
      })
      .catch((error) => {
        console.error("Failed to inspect the guest plan draft.", error);
        if (!cancelled) setStoredReferences(null);
      });
    return () => {
      cancelled = true;
    };
  }, [storeKey]);

  const pinnedMeals = useCatalogueMeals(storedReferences ?? null);

  const catalogue = useMemo(() => {
    if (
      storedReferences === undefined ||
      currentCatalogue === undefined ||
      (isAuthenticated &&
        (!spaceReady ||
          selectionSignals === undefined ||
          preferences === undefined))
    ) {
      return undefined;
    }
    if (storedReferences !== null && pinnedMeals === undefined)
      return undefined;
    if (currentCatalogue === null && storedReferences === null) return null;

    const signalsById = new Map(
      (selectionSignals ?? []).map((signal) => [
        signal.catalogueMealId,
        signal,
      ]),
    );
    const currentMeals = (currentCatalogue?.meals ?? []).map((meal) => {
      const signal = signalsById.get(meal.id);
      return {
        ...meal,
        isSaved: setup.prioritiseSavedRecipes && (signal?.isSaved ?? false),
        savedByMemberKeys: setup.prioritiseSavedRecipes
          ? signal?.savedByMemberKeys
          : [],
        dismissalCount: signal?.dismissalCount,
      };
    });
    const readableByReference = new Map<string, CatalogueMealSummary>(
      currentMeals.map((meal) => [`${meal.id}:${meal.version}`, meal] as const),
    );
    for (const meal of pinnedMeals ?? []) {
      readableByReference.set(`${meal.id}:${meal.version}`, meal);
    }
    return {
      meals: currentMeals,
      readableMeals: [...readableByReference.values()],
    };
  }, [
    currentCatalogue,
    pinnedMeals,
    storedReferences,
    selectionSignals,
    preferences,
    isAuthenticated,
    spaceReady,
    setup.prioritiseSavedRecipes,
  ]);

  return { catalogue, refreshStoredReferences };
}
