"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  ensureGuestPlanDraft,
  extendCurrentGuestPlanDraft,
  loadGuestPlanDraftForReview,
  readStoredGuestPlanDraftMealReferences,
  removeGuestPlanMeal,
  replaceGuestPlanMeal,
  shuffleCurrentGuestPlanDraft,
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
  meals: CatalogueMealSummary[];
  readableMeals: CatalogueMealSummary[];
};

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
      selectedCatalogue
        ? {
            currentMeals: selectedCatalogue.meals.map((meal) => ({
              catalogueMealId: meal.id,
              catalogueVersion: meal.version,
            })),
            readableMeals: selectedCatalogue.readableMeals.map((meal) => ({
              catalogueMealId: meal.id,
              catalogueVersion: meal.version,
            })),
          }
        : null,
    [selectedCatalogue],
  );
  const mealsByReference = useMemo(
    () =>
      new Map(
        selectedCatalogue?.readableMeals.map(
          (meal) =>
            [
              catalogueMealReferenceKey({
                catalogueMealId: meal.id,
                catalogueVersion: meal.version,
              }),
              meal,
            ] as const,
        ) ?? [],
      ),
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
    addDay,
  };
}

export function useGuestDraftCatalogue(): {
  catalogue: GuestDraftCatalogueSelection | null | undefined;
  refreshStoredReferences: () => Promise<void>;
} {
  const currentCatalogue = useCurrentCatalogue();
  const [storedReferences, setStoredReferences] = useState<
    | Awaited<ReturnType<typeof readStoredGuestPlanDraftMealReferences>>
    | undefined
  >(undefined);

  const refreshStoredReferences = useCallback(async () => {
    try {
      setStoredReferences(await readStoredGuestPlanDraftMealReferences());
    } catch (error) {
      console.error("Failed to inspect the guest plan draft.", error);
      setStoredReferences(null);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void readStoredGuestPlanDraftMealReferences()
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
  }, []);

  const pinnedMeals = useCatalogueMeals(storedReferences ?? null);

  const catalogue = useMemo(() => {
    if (storedReferences === undefined || currentCatalogue === undefined) {
      return undefined;
    }
    if (storedReferences !== null && pinnedMeals === undefined)
      return undefined;
    if (currentCatalogue === null && storedReferences === null) return null;

    const currentMeals = currentCatalogue?.meals ?? [];
    const readableByReference = new Map(
      currentMeals.map((meal) => [`${meal.id}:${meal.version}`, meal] as const),
    );
    for (const meal of pinnedMeals ?? []) {
      readableByReference.set(`${meal.id}:${meal.version}`, meal);
    }
    return {
      meals: currentMeals,
      readableMeals: [...readableByReference.values()],
    };
  }, [currentCatalogue, pinnedMeals, storedReferences]);

  return { catalogue, refreshStoredReferences };
}
