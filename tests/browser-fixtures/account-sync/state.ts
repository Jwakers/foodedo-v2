import { useSyncExternalStore } from "react";

const listeners = new Set<() => void>();
let state = {
  isLoaded: true,
  isSignedIn: new URLSearchParams(location.search).get("scenario") !== "guest",
  userId: "user-a" as string | null,
  isAuthenticated: true,
  isLoading: false,
  account: null as null | undefined | { authSubject: string },
  signOutFails: false,
};
export const counts = { personalQueries: 0, signOuts: 0 };
export function recordPersonalQuery() {
  counts.personalQueries++;
}
export function update(next: Partial<typeof state>) {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}
export function useFixture() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => state,
  );
}
export function getState() {
  return state;
}
