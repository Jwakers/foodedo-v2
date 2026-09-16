"use client";

import { useSyncExternalStore } from "react";

import {
  getEmptyPrePlanSetupSnapshot,
  getPendingPrePlanSetup,
  setPendingPrePlanSetup,
  subscribeToPendingPrePlanSetup,
  type PrePlanSetup,
} from "@/features/plan/pre-plan-setup-store";

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
