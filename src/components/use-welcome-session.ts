"use client";

import { useSyncExternalStore } from "react";

import {
  persistWelcomeSkip,
  readPersistedWelcomeSkip,
} from "@/lib/platform/welcome-session";

/**
 * In-memory fallback for this JS runtime; web and Capacitor also persist the
 * welcome dismissal on this device via persistWelcomeSkip.
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
