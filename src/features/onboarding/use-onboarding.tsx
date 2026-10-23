"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useFoodedoAuth } from "@/features/auth/use-foodedo-auth";
import { isIntroductionId, type IntroductionId } from "@/lib/domain/onboarding";
import {
  introductionStore,
  subscribeToIntroductions,
} from "./introduction-store";

function useIntroductionState() {
  const { status, userId, isAuthenticated } = useFoodedoAuth();
  const identity = userId ?? null;
  const latestIdentity = useRef(identity);
  useEffect(() => {
    latestIdentity.current = identity;
  }, [identity]);
  const local = useSyncExternalStore(
    subscribeToIntroductions,
    () => introductionStore.snapshot(identity),
    () => null,
  );
  const account = useQuery(
    api.onboarding.getState,
    isAuthenticated && userId ? { authSubject: userId } : "skip",
  );
  const retireAccount = useMutation(api.onboarding.retire);
  const [retryVersion, setRetryVersion] = useState(0);
  // Only this visit's guest actions may transfer to the next signed-in account.
  // Historic guest flags must never bleed into every account on a shared device.
  const pendingGuest = useRef(new Set<IntroductionId>());
  const retire = useCallback(
    (id: IntroductionId) => {
      introductionStore.retire(identity, [id]);
      if (status === "guest" && latestIdentity.current === null) {
        pendingGuest.current.add(id);
      }
    },
    [identity, status],
  );

  useEffect(() => {
    if (!isAuthenticated || !userId || pendingGuest.current.size === 0) return;
    introductionStore.retire(userId, [...pendingGuest.current]);
    pendingGuest.current.clear();
  }, [isAuthenticated, userId]);

  useEffect(() => {
    const retry = () => setRetryVersion((value) => value + 1);
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !userId || !account || local === null) return;
    const introductions = local
      .split(",")
      .filter(isIntroductionId)
      .filter((id) => !account.retired.includes(id));
    if (introductions.length === 0) return;
    // Local retirement stays immediate. A failed sync retries on reconnect,
    // the next account mount or a later dismissal; it never blocks the task.
    void retireAccount({ authSubject: userId, introductions }).catch(
      (error: unknown) => {
        console.error("Couldn’t sync introduction dismissals.", error);
      },
    );
  }, [isAuthenticated, userId, account, local, retireAccount, retryVersion]);

  const isRetired = useCallback(
    (id: IntroductionId) =>
      !!local?.split(",").includes(id) || !!account?.retired.includes(id),
    [local, account],
  );
  const ready =
    local !== null &&
    (status === "guest" || (isAuthenticated && account !== undefined));
  const firstSavedPlanId = account?.firstSavedPlanId;
  return useMemo(
    () => ({ ready, isRetired, retire, firstSavedPlanId }),
    [ready, isRetired, retire, firstSavedPlanId],
  );
}

const OnboardingContext = createContext<ReturnType<
  typeof useIntroductionState
> | null>(null);

/** One account subscription and sync boundary for every contextual surface. */
export function OnboardingProvider({ children }: { children: ReactNode }) {
  const value = useIntroductionState();
  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const context = useContext(OnboardingContext);
  if (!context) throw new Error("OnboardingProvider is required.");
  return context;
}
