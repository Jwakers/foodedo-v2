import {
  emptyCookSession,
  restoreCookSession,
  type CookRecipeContext,
  type CookSession,
} from "./cook-session";

export const COOK_SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1_000;

export function storeCookSession(session: CookSession, now = Date.now()) {
  return { savedAt: now, session };
}

export function recoverCookSession(
  value: unknown,
  context: CookRecipeContext,
  now = Date.now(),
) {
  if (
    typeof value !== "object" ||
    value === null ||
    !("savedAt" in value) ||
    typeof value.savedAt !== "number" ||
    !Number.isFinite(value.savedAt) ||
    value.savedAt > now ||
    now - value.savedAt >= COOK_SESSION_MAX_AGE_MS ||
    !("session" in value)
  ) {
    // Legacy records have no timestamp, so their age cannot be trusted.
    return emptyCookSession(context);
  }
  return restoreCookSession(value.session, context);
}
