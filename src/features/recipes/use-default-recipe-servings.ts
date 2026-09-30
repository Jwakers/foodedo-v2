"use client";

import { useQuery } from "convex/react";

import { api } from "../../../convex/_generated/api";
import { useFoodedoAuth } from "@/features/auth/use-foodedo-auth";

/**
 * Provides the signed-in household default only when a route has not already
 * specified servings (for example, from an active meal plan).
 */
export function useDefaultRecipeServings(hasExplicitServings: boolean) {
  const { isAuthenticated } = useFoodedoAuth();
  const preferences = useQuery(
    api.planningPreferences.getCurrent,
    isAuthenticated && !hasExplicitServings ? {} : "skip",
  );

  return {
    defaultServings: preferences?.usualServings,
    isLoading:
      isAuthenticated && !hasExplicitServings && preferences === undefined,
  };
}
