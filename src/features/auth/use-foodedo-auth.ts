"use client";

import { useAuth } from "@clerk/react";
import { useConvexAuth } from "convex/react";

export type FoodedoAuthStatus =
  "loading" | "guest" | "authenticated" | "connection_error";

/**
 * One application-level auth state for UI and private Convex reads.
 *
 * Clerk owns the browser session. Convex becomes authenticated only after it
 * has fetched and validated Clerk's token, so a signed-in Clerk session is not
 * by itself permission to query private Convex data.
 */
export function useFoodedoAuth() {
  const clerk = useAuth();
  const convex = useConvexAuth();

  let status: FoodedoAuthStatus;
  if (!clerk.isLoaded) {
    status = "loading";
  } else if (!clerk.isSignedIn) {
    status = "guest";
  } else if (convex.isLoading) {
    status = "loading";
  } else if (convex.isAuthenticated) {
    status = "authenticated";
  } else {
    status = "connection_error";
  }

  return {
    status,
    // This deliberately means Clerk only; `status` also waits for Convex auth.
    isClerkLoaded: clerk.isLoaded,
    isSignedIn: clerk.isSignedIn,
    isAuthenticated: status === "authenticated",
    userId: clerk.userId,
  } as const;
}
