"use client";

import { useCallback, useEffect, useState } from "react";

import {
  ensureGuestPlanDraft,
  loadGuestPlanDraftForReview,
  shuffleCurrentGuestPlanDraft,
} from "@/features/plan/guest-plan-draft";
import type { GuestDraftV1 } from "@/lib/domain/guest-draft";
import {
  resolveGuestPlanMealRows,
  summarizeGuestPlanDraft,
  type GuestPlanMealRow,
} from "@/lib/domain/plan-display";
import { standardCatalogue } from "@/lib/domain/standard-catalogue";

const mealsById = new Map(
  standardCatalogue.meals.map((meal) => [meal.id, meal]),
);

export type GuestPlanDraftState =
  | { status: "loading" }
  | { status: "empty" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      draft: GuestDraftV1;
      rows: GuestPlanMealRow[];
      summary: string;
    };

function toReadyState(
  draft: GuestDraftV1,
): Extract<GuestPlanDraftState, { status: "ready" }> {
  return {
    status: "ready",
    draft,
    rows: resolveGuestPlanMealRows({ draft, mealsById }),
    summary: summarizeGuestPlanDraft(draft),
  };
}

export function useGuestPlanDraft() {
  const [state, setState] = useState<GuestPlanDraftState>({
    status: "loading",
  });

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const draft = await loadGuestPlanDraftForReview();
        if (cancelled) return;

        if (!draft) {
          setState({ status: "empty" });
          return;
        }

        setState(toReadyState(draft));
      } catch (error) {
        console.error("Failed to read guest plan draft.", error);
        if (cancelled) return;
        setState({
          status: "error",
          message:
            "Foodedo couldn’t open your plan on this device. Check storage access and try again.",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const retry = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const draft = await loadGuestPlanDraftForReview();
      if (!draft) {
        setState({ status: "empty" });
        return;
      }

      setState(toReadyState(draft));
    } catch (error) {
      console.error("Failed to read guest plan draft.", error);
      setState({
        status: "error",
        message:
          "Foodedo couldn’t open your plan on this device. Check storage access and try again.",
      });
    }
  }, []);

  const startPlan = useCallback(async () => {
    const draft = await ensureGuestPlanDraft();
    setState(toReadyState(draft));
    return draft;
  }, []);

  const tryAnotherWeek = useCallback(async () => {
    const draft = await shuffleCurrentGuestPlanDraft();
    setState(toReadyState(draft));
    return draft;
  }, []);

  return { state, retry, startPlan, tryAnotherWeek };
}
