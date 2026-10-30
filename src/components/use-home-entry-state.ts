"use client";

import { usePathname } from "next/navigation";

import { useWelcomeSession } from "@/components/use-welcome-session";
import { useDashboardState } from "@/features/dashboard/use-dashboard-state";

/**
 * Home reveals its header and dock together with the resolved dashboard.
 * Public deep links and the rest of the guest/signed-in app keep chrome.
 */
export function useShowAppChrome() {
  const pathname = usePathname();
  const state = useHomeEntryState();

  if (pathname !== "/") {
    return true;
  }

  return state === "home";
}

export type HomeEntryState = "loading" | "welcome" | "home";

export function useHomeEntryState(): HomeEntryState {
  const pathname = usePathname();
  // The shell also uses this hook on public deep links. Do not start a Home
  // plan subscription there; Convex shares matching Home subscriptions.
  const { auth, isCheckingPlan } = useDashboardState(pathname === "/");
  const { hasSkippedWelcome } = useWelcomeSession();

  if (!auth.isClerkLoaded) {
    return "loading";
  }

  if (auth.isSignedIn || hasSkippedWelcome) {
    return isCheckingPlan ? "loading" : "home";
  }

  return "welcome";
}
