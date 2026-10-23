import type { IntroductionId } from "@/lib/domain/onboarding";

const prefix = "foodedo:onboarding:v1:";
export const introductionStorageKey = (userId: string | null) =>
  `${prefix}${userId ?? "guest"}`;
const changed = "foodedo:onboarding-changed";

/** Keep browser I/O and its blocked-storage fallback outside React. */
export function createIntroductionStore(
  storage: () => Pick<Storage, "getItem" | "setItem">,
  notify: () => void,
) {
  const memory = new Map<string, string>();
  function snapshot(userId: string | null) {
    const key = introductionStorageKey(userId);
    try {
      return memory.get(key) ?? storage().getItem(key) ?? "";
    } catch {
      return memory.get(key) ?? "";
    }
  }
  return {
    snapshot,
    retire(userId: string | null, introductions: readonly IntroductionId[]) {
      const previous = snapshot(userId);
      const value = [
        ...new Set([...previous.split(",").filter(Boolean), ...introductions]),
      ]
        .sort()
        .join(",");
      if (value === previous) return;
      const key = introductionStorageKey(userId);
      try {
        storage().setItem(key, value);
        memory.delete(key);
      } catch {
        memory.set(key, value);
      }
      notify();
    },
    invalidate(key: string | null) {
      if (key === null) memory.clear();
      else memory.delete(key);
    },
  };
}

export const introductionStore = createIntroductionStore(
  () => window.localStorage,
  () => window.dispatchEvent(new Event(changed)),
);
export function subscribeToIntroductions(notify: () => void) {
  function onStorage(event: StorageEvent) {
    if (event.key !== null && !event.key.startsWith(prefix)) return;
    introductionStore.invalidate(event.key);
    notify();
  }
  window.addEventListener("storage", onStorage);
  window.addEventListener(changed, notify);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(changed, notify);
  };
}
