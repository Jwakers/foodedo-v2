"use client";

import { useAuth } from "@clerk/react";
import { usePathname } from "next/navigation";

import { useWelcomeSession } from "@/components/use-welcome-session";

/**
 * App chrome (header + dock) stays off for the signed-out Welcome entry on `/`.
 * Public deep links and the rest of the guest/signed-in app keep chrome.
 */
export function useShowAppChrome() {
  const pathname = usePathname();
  const { isLoaded, isSignedIn } = useAuth();
  const { hasSkippedWelcome } = useWelcomeSession();

  if (pathname !== "/") {
    return true;
  }

  if (!isLoaded) {
    return false;
  }

  if (isSignedIn || hasSkippedWelcome) {
    return true;
  }

  return false;
}

export type HomeEntryState = "loading" | "welcome" | "home";

export function useHomeEntryState(): HomeEntryState {
  const { isLoaded, isSignedIn } = useAuth();
  const { hasSkippedWelcome } = useWelcomeSession();

  if (!isLoaded) {
    return "loading";
  }

  if (isSignedIn || hasSkippedWelcome) {
    return "home";
  }

  return "welcome";
}
