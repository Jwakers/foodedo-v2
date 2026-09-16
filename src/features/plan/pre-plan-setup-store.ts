import type { PlanDays } from "@/lib/domain/guest-draft";

export type PrePlanSetup = {
  planDays: PlanDays;
  startDate: string;
  servings: number;
  prioritiseSavedRecipes: boolean;
};

let pendingSetup: PrePlanSetup | null = null;
const listeners = new Set<() => void>();

export function getPendingPrePlanSetup() {
  return pendingSetup;
}

export function getEmptyPrePlanSetupSnapshot() {
  return null;
}

export function setPendingPrePlanSetup(setup: PrePlanSetup) {
  pendingSetup = setup;
  emitChange();
}

export function clearPendingPrePlanSetup() {
  if (pendingSetup === null) return;
  pendingSetup = null;
  emitChange();
}

export function subscribeToPendingPrePlanSetup(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emitChange() {
  for (const listener of listeners) listener();
}
