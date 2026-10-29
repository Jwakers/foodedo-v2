import { useSyncExternalStore } from "react";
import { ConvexError } from "convex/values";

const listeners = new Set<() => void>();
const scenario = new URLSearchParams(location.search).get("scenario");
let state = {
  isLoaded: true,
  isSignedIn: new URLSearchParams(location.search).get("scenario") !== "guest",
  userId: "user-a" as string | null,
  isAuthenticated: true,
  isLoading: scenario === "auth-loading",
  account: (scenario === "loading"
    ? undefined
    : scenario === "ready"
      ? { authSubject: "user-a" }
      : null) as null | undefined | { authSubject: string },
  signOutFails: false,
  recovery: (scenario === "recover"
    ? "succeed"
    : scenario === "deleted"
      ? "deleted"
      : scenario === "pending"
        ? "pending"
        : "fail") as "fail" | "succeed" | "pending" | "deleted",
};
export const counts = { personalQueries: 0, signOuts: 0, recoveries: 0 };
let finishRecovery: (() => void) | undefined;
export function completeRecovery() {
  finishRecovery?.();
  finishRecovery = undefined;
}
export async function recoverAccount() {
  counts.recoveries++;
  const userId = state.userId!;
  if (state.recovery === "deleted")
    throw new ConvexError({ code: "ACCOUNT_DELETED" });
  if (state.recovery === "fail") throw new Error("Provisioning unavailable");
  if (state.recovery === "pending") {
    await new Promise<void>((resolve) => {
      finishRecovery = resolve;
    });
  }
  // A late response can still contain the previous identity's record.
  update({ account: { authSubject: userId } });
  return userId;
}
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
