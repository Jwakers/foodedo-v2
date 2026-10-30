"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useHouseholdSpace } from "@/features/household/household-context";
import type { ReadyShoppingList } from "./shopping-list-types";

/** One automatic preparation attempt per space/plan, followed by explicit retry. */
export function useShoppingListPreparation(current: ReadyShoppingList | null) {
  const {
    spaceArgs: { householdId },
    spaceKey,
  } = useHouseholdSpace();
  const ensureList = useMutation(api.shoppingLists.ensureForCurrentPlan);
  const planId = current?.currentMealPlanId ?? null;
  const key = `${spaceKey}:${planId}`;
  const needsSync =
    current !== null && (current.list === null || current.list.needsSync);
  const attempted = useRef<{
    key: string;
    retry: number;
    promise: ReturnType<typeof ensureList>;
  } | null>(null);
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<{
    key: string | null;
    retry: number;
    error: string | null;
  }>({ key: null, retry: -1, error: null });

  useEffect(() => {
    if (!needsSync) return;
    if (attempted.current?.key !== key || attempted.current.retry !== retry) {
      attempted.current = {
        key,
        retry,
        promise: ensureList(householdId ? { householdId } : {}),
      };
    }
    let cancelled = false;
    let errorMessage: string | null = null;
    // Strict Mode can subscribe again to the same attempt without duplicating it.
    void attempted.current.promise
      .then((result) => {
        if (result.status !== "ready")
          errorMessage = syncErrorMessage(result.status);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.error("Failed to synchronize the shopping list.", error);
        errorMessage = "Foodedo couldn’t prepare your list. Try again.";
      })
      .finally(() => {
        if (!cancelled) setState({ key, retry, error: errorMessage });
      });
    return () => {
      cancelled = true;
    };
  }, [ensureList, householdId, key, needsSync, retry]);

  return {
    needsSync,
    isSyncing: needsSync && (state.key !== key || state.retry !== retry),
    syncError: state.key === key && state.retry === retry ? state.error : null,
    retrySync: () => setRetry((value) => value + 1),
  };
}

function syncErrorMessage(status: string) {
  switch (status) {
    case "no_active_plan":
      return "Plan a week before creating a shopping list.";
    case "active_plan_conflict":
      return "Your account has conflicting active plans.";
    case "plan_unavailable":
      return "This week can’t be turned into a list yet.";
    default:
      return "Foodedo couldn’t prepare your list. Try again.";
  }
}
