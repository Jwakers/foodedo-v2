import { useSyncExternalStore } from "react";
const listeners = new Set<() => void>();
let space = "alice:private";
const requests: Array<{
  space: string;
  finish: (result: { status: "ready" | "plan_unavailable" }) => void;
}> = [];
export const fixture = {
  get requests() {
    return requests.map(({ space }) => space);
  },
  select(next: string) {
    space = next;
    for (const notify of listeners) notify();
  },
  finish(index: number, status: "ready" | "plan_unavailable") {
    requests[index].finish({ status });
  },
};
export function useSpace() {
  return useSyncExternalStore(
    (notify) => {
      listeners.add(notify);
      return () => {
        listeners.delete(notify);
      };
    },
    () => space,
  );
}
export function useHouseholdSpace() {
  return { spaceKey: useSpace(), spaceArgs: {} };
}
const ensureList = () =>
  new Promise<{ status: "ready" | "plan_unavailable" }>((finish) =>
    requests.push({ space, finish }),
  );
export function useMutation() {
  return ensureList;
}
