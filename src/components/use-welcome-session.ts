"use client";

import { useSyncExternalStore } from "react";

import {
  persistWelcomeSkip,
  readPersistedWelcomeSkip,
} from "@/lib/platform/welcome-session";

/**
 * In-memory skip for this JS runtime (Capacitor cold starts reset it;
 * web also writes sessionStorage via persistWelcomeSkip).
 */
let skippedThisRuntime = false;
const listeners = new Set<() => void>();

function subscribe(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

function getSnapshot() {
  return skippedThisRuntime || readPersistedWelcomeSkip();
}

function getServerSnapshot() {
  return false;
}

export function enterGuestExperience() {
  persistWelcomeSkip();
  skippedThisRuntime = true;
  for (const listener of listeners) {
    listener();
  }
}

export function useWelcomeSession() {
  const hasSkippedWelcome = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  return { hasSkippedWelcome, enterGuestExperience };
}
