"use client";

import {
  createContext,
  useContext,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useFoodedoAuth } from "@/features/auth/use-foodedo-auth";
import { setDraftSpaceKey } from "@/lib/platform/draft-space";

const changed = "foodedo:space";
const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function notify() {
  for (const listener of listeners) listener();
}
function readSelection(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function saveSelection(key: string, value: string) {
  let persisted = false;
  try {
    localStorage.setItem(key, value);
    persisted = true;
  } catch {
    /* Memory selection still works when persistence is blocked. */
  }
  notify();
  return persisted;
}

type Household = NonNullable<
  ReturnType<typeof useQuery<typeof api.households.current>>
>;
type SpaceContext = {
  household: Household | null | undefined;
  ready: boolean;
  isHousehold: boolean;
  spaceArgs: { householdId?: Id<"households"> };
  spaceKey: string;
  select: (
    selection: "household" | "private",
    householdId?: Id<"households">,
  ) => void;
};
const Context = createContext<SpaceContext | null>(null);

export function HouseholdProvider({ children }: { children: ReactNode }) {
  const auth = useFoodedoAuth();
  const household = useQuery(
    api.households.current,
    auth.isAuthenticated ? {} : "skip",
  );
  const selectionKey = `foodedo:space:${auth.userId ?? "guest"}:${household?._id ?? "none"}`;
  const persisted = useSyncExternalStore(
    subscribe,
    () => readSelection(selectionKey),
    () => null,
  );
  const [memory, setMemory] = useState<{ key: string; value: string } | null>(
    null,
  );
  const selected = memory?.key === selectionKey ? memory.value : persisted;
  const isHousehold = !!household && selected !== "private";
  const ready =
    auth.status === "guest" ||
    auth.status === "connection_error" ||
    (auth.isAuthenticated && household !== undefined);
  const spaceKey = auth.isAuthenticated
    ? `${auth.userId}:${isHousehold ? household!._id : "private"}`
    : "guest";
  useLayoutEffect(() => {
    setDraftSpaceKey(spaceKey === "guest" ? "current" : spaceKey);
  }, [spaceKey]);
  useLayoutEffect(() => {
    window.addEventListener("storage", notify);
    window.addEventListener(changed, notify);
    return () => {
      window.removeEventListener("storage", notify);
      window.removeEventListener(changed, notify);
    };
  }, []);
  function select(value: "household" | "private", id = household?._id) {
    const key = `foodedo:space:${auth.userId ?? "guest"}:${id ?? "none"}`;
    // Storage is authoritative across tabs. Keep a memory fallback only when
    // this browser blocks persistence, otherwise it masks future storage events.
    const persisted = saveSelection(key, value);
    setMemory(persisted ? null : { key, value });
  }
  return (
    <Context.Provider
      value={{
        household,
        ready,
        isHousehold,
        spaceArgs: isHousehold ? { householdId: household!._id } : {},
        spaceKey,
        select,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useHouseholdSpace() {
  const value = useContext(Context);
  if (!value) throw new Error("HouseholdProvider is required.");
  return value;
}
