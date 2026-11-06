"use client";

import {
  createContext,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useFoodedoAuth } from "@/features/auth/use-foodedo-auth";
import { useHouseholdSpace } from "@/features/household/household-context";
import { validAllergyIds, type AllergyId } from "@/lib/domain/allergies";

const key = "foodedo:guest-allergies:v1";
const changed = "foodedo:allergies";
function subscribe(listener: () => void) {
  window.addEventListener(changed, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(changed, listener);
    window.removeEventListener("storage", listener);
  };
}
function read() {
  try {
    return localStorage.getItem(key) ?? "[]";
  } catch {
    return "[]";
  }
}
function parse(raw: string): AllergyId[] {
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value)
      ? validAllergyIds(
          value.filter((id): id is string => typeof id === "string"),
        )
      : [];
  } catch {
    return [];
  }
}
export function readGuestAllergies() {
  return parse(read());
}

type Context = {
  profileKey: string;
  ready: boolean;
  signedIn: boolean;
  ownIds: readonly string[];
  effectiveIds: readonly string[];
  guestIds: readonly string[];
  shareWithHousehold: boolean;
  revision: number | string;
  hasHousehold: boolean;
  save: (
    ids: string[],
    share: boolean,
    revision: number | string,
  ) => Promise<void>;
};
const AllergyContext = createContext<Context>({
  profileKey: "guest",
  ready: true,
  signedIn: false,
  ownIds: [],
  effectiveIds: [],
  guestIds: [],
  shareWithHousehold: false,
  revision: 0,
  hasHousehold: false,
  save: async () => {
    throw new Error("Allergies are unavailable here.");
  },
});
export function AllergyProvider({ children }: { children: ReactNode }) {
  const auth = useFoodedoAuth();
  const space = useHouseholdSpace();
  const profile = useQuery(
    api.allergies.getCurrent,
    auth.isAuthenticated && space.ready ? space.spaceArgs : "skip",
  );
  const saveProfile = useMutation(api.allergies.save);
  const rawGuest = useSyncExternalStore(subscribe, read, () => "[]");
  const guestIds = useMemo(() => parse(rawGuest), [rawGuest]);
  const signedIn = auth.isAuthenticated;
  const ready =
    auth.status === "guest" ||
    (signedIn && space.ready && profile !== undefined);
  return (
    <AllergyContext.Provider
      value={{
        profileKey: auth.userId ?? "guest",
        ready,
        signedIn,
        guestIds,
        ownIds: signedIn ? (profile?.allergenIds ?? []) : guestIds,
        effectiveIds: signedIn ? (profile?.effectiveIds ?? []) : guestIds,
        revision: signedIn ? (profile?.revision ?? 0) : rawGuest,
        shareWithHousehold: profile?.shareWithHousehold ?? false,
        hasHousehold: Boolean(space.household),
        save: async (ids, share, revision) => {
          if (!ready)
            throw new Error(
              "Wait for your allergies to finish loading, then try again.",
            );
          if (signedIn) {
            if (typeof revision !== "number")
              throw new Error(
                "Reopen Allergies to review your account’s saved selections.",
              );
            await saveProfile({
              allergenIds: ids,
              shareWithHousehold: share,
              expectedRevision: revision,
            });
            // Clear only the selections actually adopted. Re-read after the
            // network request so a different tab's newer draft is preserved.
            try {
              const remaining = readGuestAllergies().filter(
                (id) => !ids.includes(id),
              );
              if (remaining.length)
                localStorage.setItem(key, JSON.stringify(remaining));
              else localStorage.removeItem(key);
              window.dispatchEvent(new Event(changed));
            } catch {
              /* Account save succeeded; local cleanup can be retried later. */
            }
          } else {
            if (revision !== read())
              throw new Error(
                "Your device allergies changed elsewhere. Reopen Allergies before saving.",
              );
            // Do not show success when device storage rejected the write.
            localStorage.setItem(key, JSON.stringify(validAllergyIds(ids)));
            window.dispatchEvent(new Event(changed));
          }
        },
      }}
    >
      {children}
    </AllergyContext.Provider>
  );
}
export function useAllergies() {
  return useContext(AllergyContext);
}
