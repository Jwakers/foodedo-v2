"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useFoodedoAuth } from "@/features/auth/use-foodedo-auth";
import { useHouseholdSpace } from "@/features/household/household-context";

/** Home and its chrome must agree on when the actual dashboard is ready. */
export function useDashboardState(enabled = true) {
  const auth = useFoodedoAuth();
  const { household, spaceArgs, ready: spaceReady } = useHouseholdSpace();
  const currentPlan = useQuery(
    api.mealPlans.getCurrent,
    enabled && auth.isAuthenticated && spaceReady ? spaceArgs : "skip",
  );
  const isCheckingPlan =
    auth.status === "loading" ||
    !spaceReady ||
    (auth.isAuthenticated && currentPlan === undefined);

  return { auth, household, currentPlan, isCheckingPlan };
}
