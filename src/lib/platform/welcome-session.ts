/**
 * Welcome skip persistence.
 *
 * Web / PWA: sessionStorage so a refresh in the same browsing session keeps
 * the guest app, while a new tab/session can show Welcome again.
 *
 * Capacitor: intentionally memory-only (handled by the provider). Backgrounding
 * keeps React state while the process lives; a cold start shows Welcome again.
 */

export const welcomeSkipStorageKey = "foodedo.welcome.skipped";

const isCapacitorBuild = process.env.NEXT_PUBLIC_CAPACITOR_BUILD === "true";

export function shouldPersistWelcomeSkip(): boolean {
  return !isCapacitorBuild;
}

export function readPersistedWelcomeSkip(): boolean {
  if (!shouldPersistWelcomeSkip() || typeof window === "undefined") {
    return false;
  }

  try {
    return window.sessionStorage.getItem(welcomeSkipStorageKey) === "1";
  } catch {
    return false;
  }
}

export function persistWelcomeSkip(): void {
  if (!shouldPersistWelcomeSkip() || typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(welcomeSkipStorageKey, "1");
  } catch {
    // Private mode / quota — in-memory skip in the provider still applies.
  }
}
