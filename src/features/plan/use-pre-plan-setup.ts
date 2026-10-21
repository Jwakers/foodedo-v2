"use client";

import { useHouseholdSpace } from "@/features/household/household-context";
import { useSyncExternalStore } from "react";

import {
  getEmptyPrePlanSetupSnapshot,
  getPendingPrePlanSetup,
  setPendingPrePlanSetup,
  subscribeToPendingPrePlanSetup,
  type PrePlanSetup,
} from "@/features/plan/pre-plan-setup-store";
import { tomorrowPlanDate } from "@/lib/domain/plan-display";

export function fallbackPrePlanSetup(
  preferences:
    | (Pick<PrePlanSetup, "prioritiseSavedRecipes"> & {
        usualPlanDays: PrePlanSetup["planDays"];
        usualServings: number;
      })
    | null
    | undefined,
): PrePlanSetup {
  return preferences
    ? {
        planDays: preferences.usualPlanDays,
        startDate: tomorrowPlanDate(),
        servings: preferences.usualServings,
        prioritiseSavedRecipes: preferences.prioritiseSavedRecipes,
      }
    : {
        planDays: 7,
        startDate: tomorrowPlanDate(),
        servings: 4,
        prioritiseSavedRecipes: true,
      };
}

export function usePrePlanSetup(fallback: PrePlanSetup) {
  const { spaceKey } = useHouseholdSpace();
  const key = spaceKey === "guest" ? "current" : spaceKey;
  const pendingSetup = useSyncExternalStore(
    subscribeToPendingPrePlanSetup,
    () => getPendingPrePlanSetup(key),
    getEmptyPrePlanSetupSnapshot,
  );

  return {
    setup: pendingSetup ?? fallback,
    applySetup: (setup: PrePlanSetup) => setPendingPrePlanSetup(setup, key),
  };
}
