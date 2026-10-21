import { getDraftSpaceKey } from "@/lib/platform/draft-space";
import type { PlanDays } from "@/lib/domain/guest-draft";

export type PrePlanSetup = {
  planDays: PlanDays;
  startDate: string;
  servings: number;
  prioritiseSavedRecipes: boolean;
};

const pendingSetups = new Map<string, PrePlanSetup>();
const listeners = new Set<() => void>();

export function getPendingPrePlanSetup(key = getDraftSpaceKey()) {
  return pendingSetups.get(key) ?? null;
}

export function getEmptyPrePlanSetupSnapshot() {
  return null;
}

export function setPendingPrePlanSetup(
  setup: PrePlanSetup,
  key = getDraftSpaceKey(),
) {
  pendingSetups.set(key, setup);
  emitChange();
}

export function clearPendingPrePlanSetup(key = getDraftSpaceKey()) {
  if (!pendingSetups.delete(key)) return;
  emitChange();
}

export function subscribeToPendingPrePlanSetup(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emitChange() {
  for (const listener of listeners) listener();
}
