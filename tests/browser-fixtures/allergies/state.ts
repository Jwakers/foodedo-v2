import { useSyncExternalStore } from "react";
export const counts = { writes: 0, signIns: 0, choices: [] as string[] };
let state = {
  signedIn: false,
  fail: false,
  profile: {
    allergenIds: [] as string[],
    effectiveIds: [] as string[],
    shareWithHousehold: false,
    revision: 0,
  },
};
const listeners = new Set<() => void>();
export function update(patch: Partial<typeof state>) {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}
export function read() {
  return state;
}
export function useFixture() {
  return useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, read);
}
