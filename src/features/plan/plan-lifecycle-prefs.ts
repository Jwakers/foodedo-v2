"use client";

import { useCallback, useSyncExternalStore } from "react";

const FIRST_SAVE_SUCCESS_KEY = "foodedo.plan.first-save-success-seen";
const WEEK_SAVED_BANNER_KEY = "foodedo.plan.week-saved-banner-dismissed";
const PLAN_PREFS_CHANGED_EVENT = "foodedo:plan-prefs-changed";
const sessionFlags = new Set<string>();

function readFlag(key: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(key) === "1" || sessionFlags.has(key);
  } catch {
    return sessionFlags.has(key);
  }
}

function writeFlag(key: string): void {
  if (typeof window === "undefined") return;
  sessionFlags.add(key);
  try {
    window.localStorage.setItem(key, "1");
  } catch {
    // Preference persistence is best-effort.
  }
  window.dispatchEvent(new Event(PLAN_PREFS_CHANGED_EVENT));
}

function accountPreferenceKey(
  baseKey: string,
  accountId: string | null | undefined,
): string {
  return accountId ? `${baseKey}:${accountId}` : baseKey;
}

function subscribeToPlanPrefs(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(PLAN_PREFS_CHANGED_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(PLAN_PREFS_CHANGED_EVENT, onChange);
  };
}

/** True after the first-save “Your week is sorted” experience has been shown. */
export function hasSeenFirstSaveSuccess(accountId?: string | null): boolean {
  return readFlag(accountPreferenceKey(FIRST_SAVE_SUCCESS_KEY, accountId));
}

export function markFirstSaveSuccessSeen(accountId?: string | null): void {
  writeFlag(accountPreferenceKey(FIRST_SAVE_SUCCESS_KEY, accountId));
}

export function useHasSeenFirstSaveSuccess(accountId?: string | null): boolean {
  const getSnapshot = useCallback(
    () => hasSeenFirstSaveSuccess(accountId),
    [accountId],
  );
  return useSyncExternalStore(subscribeToPlanPrefs, getSnapshot, () => false);
}

/** Green Week education banner — show until dismissed. */
export function shouldShowWeekSavedBanner(accountId?: string | null): boolean {
  return !readFlag(accountPreferenceKey(WEEK_SAVED_BANNER_KEY, accountId));
}

export function dismissWeekSavedBanner(accountId?: string | null): void {
  writeFlag(accountPreferenceKey(WEEK_SAVED_BANNER_KEY, accountId));
}

export function useShouldShowWeekSavedBanner(
  accountId?: string | null,
): boolean {
  const getSnapshot = useCallback(
    () => shouldShowWeekSavedBanner(accountId),
    [accountId],
  );
  return useSyncExternalStore(subscribeToPlanPrefs, getSnapshot, () => false);
}
