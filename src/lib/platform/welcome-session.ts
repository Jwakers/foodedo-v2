/**
 * Welcome skip persistence.
 *
 * A device-local flag keeps returning guests in the app across web sessions
 * and Capacitor cold starts. It stores no identity or personal draft data.
 * The hook retains an in-memory fallback when storage is unavailable.
 */

export const welcomeSkipStorageKey = "foodedo:welcome-skipped:v1";

export function readPersistedWelcomeSkip(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    if (window.localStorage.getItem(welcomeSkipStorageKey) === "1") return true;
  } catch {
    // Still honour an existing session if durable storage is blocked.
  }

  // Preserve the dismissal for web sessions opened before durable dismissal
  // shipped. New entries only write the versioned local-storage flag.
  try {
    return window.sessionStorage.getItem("foodedo.welcome.skipped") === "1";
  } catch {
    return false;
  }
}

export function persistWelcomeSkip(): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(welcomeSkipStorageKey, "1");
  } catch {
    // Private mode / quota — in-memory skip in the provider still applies.
  }
}
