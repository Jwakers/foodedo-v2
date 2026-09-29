"use client";

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
  const pendingSetup = useSyncExternalStore(
    subscribeToPendingPrePlanSetup,
    getPendingPrePlanSetup,
    getEmptyPrePlanSetupSnapshot,
  );

  return {
    setup: pendingSetup ?? fallback,
    applySetup: setPendingPrePlanSetup,
  };
}
