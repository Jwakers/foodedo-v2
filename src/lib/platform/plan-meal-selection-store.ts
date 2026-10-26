// Home selection is a tab-local UI choice, never a cooking/completion signal.
const selections = new Map<string, string>();
const listeners = new Set<() => void>();

export function planMealSelectionKey(spaceKey: string, planId: string) {
  return `foodedo:home-meal:${JSON.stringify([spaceKey, planId])}`;
}

export function subscribeToPlanMealSelection(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function readPlanMealSelection(key: string): string | null {
  if (typeof window === "undefined") return null;
  const memory = selections.get(key);
  if (memory !== undefined) return memory;
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writePlanMealSelection(key: string, slotKey: string) {
  if (typeof window === "undefined" || readPlanMealSelection(key) === slotKey)
    return;
  selections.set(key, slotKey);
  try {
    window.sessionStorage.setItem(key, slotKey);
  } catch {
    // Selection still survives client navigation when storage is unavailable.
  }
  for (const listener of listeners) listener();
}

export function getServerPlanMealSelection(): null {
  return null;
}
