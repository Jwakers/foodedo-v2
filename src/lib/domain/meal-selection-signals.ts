/** Storage-independent preference facts. Member keys are opaque within a space. */
export type MealPreferenceSignals = {
  savedByMemberKeys?: readonly string[];
  dismissalCount?: number;
};

export function uniqueSavingMembers(signals: MealPreferenceSignals): string[] {
  return [...new Set(signals.savedByMemberKeys ?? [])];
}

/** A rejection is a weak contextual signal, never a permanent exclusion. */
export function dismissalPenalty(count = 0): number {
  return -Math.min(Math.max(count, 0), 3) * 6;
}
