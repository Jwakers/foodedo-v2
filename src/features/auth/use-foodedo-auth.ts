"use client";

import { useAuth } from "@clerk/react";
import { useConvexAuth } from "convex/react";
import { useContext } from "react";
import { AccountReadinessContext } from "./account-readiness";

export type FoodedoAuthStatus =
  "loading" | "guest" | "authenticated" | "connection_error";

/**
 * One application-level auth state for UI and private Convex reads.
 *
 * Clerk owns the browser session. Convex becomes authenticated only after it
 * has fetched and validated Clerk's token. Personal capabilities also wait for
 * users.current to match that session; a valid token alone cannot open them.
 */
export function useFoodedoAuth() {
  const clerk = useAuth();
  const convex = useConvexAuth();
  const account = useContext(AccountReadinessContext);

  let status: FoodedoAuthStatus;
  if (!clerk.isLoaded) {
    status = "loading";
  } else if (!clerk.isSignedIn) {
    status = "guest";
  } else if (convex.isLoading) {
    status = "loading";
  } else if (convex.isAuthenticated) {
    status =
      account.ready && account.userId === clerk.userId
        ? "authenticated"
        : "loading";
  } else {
    status = "connection_error";
  }

  return {
    status,
    // Clerk only; `status` also waits for Convex and the matching account.
    isClerkLoaded: clerk.isLoaded,
    isSignedIn: clerk.isSignedIn,
    isAuthenticated: status === "authenticated",
    userId: clerk.userId,
  } as const;
}
