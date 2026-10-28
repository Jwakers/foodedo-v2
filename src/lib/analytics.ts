import type { PostHog } from "posthog-js";

export type PageType =
  | "home"
  | "article"
  | "guide"
  | "landing"
  | "recipe"
  | "recipes_index"
  | "app"
  | "other";
type Events = {
  $pageview: { path: string; page_type: PageType };
  try_foodedo_clicked: { source_path: string; cta_location: string };
  plan_generated: {
    is_guest: boolean;
    household_size: number;
    days: number;
    meal_count: number;
    generation_ms: number;
  };
  plan_generation_failed: { is_guest: boolean; error_type: "generation_error" };
  plan_saved: { is_guest_claim?: boolean; meal_count: number };
  shopping_list_viewed: Record<string, never>;
  signed_up: Record<string, never>;
  signed_in: Record<string, never>;
  plan_returned: { days_since_last_visit: number };
  recipe_viewed: {
    recipe_slug: string;
    referrer_type: "article" | "recipes_index" | "search" | "other";
  };
};

let client: Promise<PostHog | null> | undefined;
let optedOutInMemory = false;
// Desired Clerk identity is updated even while capture is disabled.
let currentUserId: string | null = null;
let appliedUserId: string | null = null;
let needsIdentityReset = false;
let identityRevision = 0;

function syncIdentity(ph: PostHog, resumeCapture = false) {
  if (needsIdentityReset) {
    ph.reset();
    appliedUserId = null;
    needsIdentityReset = false;
    if (analyticsEnabled()) ph.register_once(firstAttribution());
  }
  if (resumeCapture) ph.opt_in_capturing({ captureEventName: false });
  if (analyticsEnabled() && currentUserId && appliedUserId !== currentUserId) {
    ph.identify(currentUserId);
    appliedUserId = currentUserId;
  }
}

export function isAnalyticsOptedOut() {
  if (optedOutInMemory) return true;
  try {
    return localStorage.getItem("foodedo:analytics-opt-out") === "true";
  } catch {
    return false;
  }
}

export function setAnalyticsOptOut(disabled: boolean) {
  optedOutInMemory = disabled;
  try {
    localStorage.setItem("foodedo:analytics-opt-out", String(disabled));
    if (disabled) {
      sessionStorage.removeItem("foodedo:attribution:v1");
      for (const key of Object.keys(localStorage)) {
        if (
          key.startsWith("foodedo:plan-last-seen:") ||
          key.startsWith("foodedo:plan-save-tracked:v1:")
        )
          localStorage.removeItem(key);
      }
    }
  } catch {
    /* preference still applies for this document */
  }
  if (client)
    void client
      .then((ph) => {
        if (!ph) {
          client = undefined;
          return;
        }
        if (disabled) ph.opt_out_capturing();
        else if (analyticsEnabled()) syncIdentity(ph, true);
      })
      .catch(() => {});
  window.dispatchEvent(new Event("foodedo:analytics-preference"));
}

export function analyticsEnabled() {
  return (
    typeof window !== "undefined" &&
    !!process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim() &&
    process.env.NEXT_PUBLIC_CAPACITOR_BUILD !== "true" &&
    navigator.doNotTrack !== "1" &&
    !isAnalyticsOptedOut()
  );
}

/** Strip search/hash, which may contain contact details, auth tokens or private IDs. */
export function safePath(path: string) {
  const clean = path.split(/[?#]/)[0];
  if (/^\/household\/join\//.test(clean)) return "/household/join/[token]";
  return clean;
}

export function attribution(url: string, referrer: string) {
  const location = new URL(url);
  let domain = "";
  try {
    domain = new URL(referrer).hostname.toLowerCase();
  } catch {
    /* direct visit */
  }
  const hasUtm = [...location.searchParams.keys()].some((key) =>
    key.startsWith("utm_"),
  );
  // Host boundary checks prevent google.com.attacker.example from matching.
  const search =
    /^(www\.)?(google\.(com|co\.[a-z]{2}|[a-z]{2}|com\.[a-z]{2})|bing\.com|duckduckgo\.com|ecosia\.org|([a-z]+\.)?yahoo\.com)$/.test(
      domain,
    );
  return {
    first_landing_path: safePath(location.pathname),
    // Keep only the origin: referrer paths/query strings can contain personal data.
    first_referrer: domain ? new URL(referrer).origin : "",
    first_referring_domain: domain,
    utm_source: campaignValue(location.searchParams.get("utm_source")),
    utm_medium: campaignValue(location.searchParams.get("utm_medium")),
    utm_campaign: campaignValue(location.searchParams.get("utm_campaign")),
    is_organic_search: search && !hasUtm,
  };
}

function campaignValue(value: string | null) {
  // Only campaign labels, never arbitrary free text, emails or URLs.
  return value && /^[a-zA-Z0-9_-]{1,80}$/.test(value) ? value : "";
}

function firstAttribution() {
  const current = attribution(window.location.href, document.referrer);
  try {
    const key = "foodedo:attribution:v1";
    const stored = sessionStorage.getItem(key);
    if (stored) return JSON.parse(stored) as typeof current;
    sessionStorage.setItem(key, JSON.stringify(current));
  } catch {
    /* blocked storage still permits in-memory analytics */
  }
  return current;
}

export function initAnalytics(): Promise<PostHog | null> {
  if (!analyticsEnabled()) return Promise.resolve(null);
  const firstTouch = firstAttribution();
  return (client ??= import("posthog-js")
    .then(({ default: posthog }) => {
      if (!analyticsEnabled()) return null;
      posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
        api_host: "/ingest",
        ui_host: (
          process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://eu.i.posthog.com"
        ).replace(".i.posthog.com", ".posthog.com"),
        capture_pageview: false,
        capture_pageleave: true,
        autocapture: false,
        capture_dead_clicks: false,
        capture_heatmaps: false,
        disable_external_dependency_loading: true,
        disable_session_recording: true,
        disable_surveys: true,
        capture_performance: false,
        capture_exceptions: false,
        person_profiles: "identified_only",
        persistence: "memory",
        respect_dnt: true,
        ip: false,
        save_referrer: false,
        save_campaign_params: false,
        advanced_disable_flags: true,
        // Strip SDK URL/referrer/title defaults as well as explicit properties.
        before_send: (event) => {
          if (!event || !analyticsEnabled()) return null;
          const allowed = new Set([
            "token",
            "distinct_id",
            "$device_id",
            "$user_id",
            "$anon_distinct_id",
            "$is_identified",
            "$process_person_profile",
            "$session_id",
            "$window_id",
            "$lib",
            "$lib_version",
            "first_landing_path",
            "first_referrer",
            "first_referring_domain",
            "utm_source",
            "utm_medium",
            "utm_campaign",
            "is_organic_search",
            "path",
            "page_type",
            "source_path",
            "cta_location",
            "is_guest",
            "household_size",
            "days",
            "meal_count",
            "generation_ms",
            "error_type",
            "is_guest_claim",
            "days_since_last_visit",
            "recipe_slug",
            "referrer_type",
          ]);
          for (const key of Object.keys(event.properties)) {
            if (!allowed.has(key)) delete event.properties[key];
          }
          event.properties.$geoip_disable = true;
          return event;
        },
      });
      posthog.register_once(firstTouch);
      if (
        process.env.NODE_ENV === "development" &&
        process.env.NEXT_PUBLIC_POSTHOG_DEBUG === "true"
      )
        posthog.debug();
      return posthog;
    })
    .catch(() => null));
}

export function track<E extends keyof Events>(
  event: E,
  props: Events[E],
): void {
  const revision = identityRevision;
  void initAnalytics()
    .then((ph) => {
      if (ph && analyticsEnabled() && revision === identityRevision) {
        syncIdentity(ph);
        ph.capture(event, props);
      }
    })
    .catch(() => {});
}
export function identify(userId: string): void {
  if (currentUserId && currentUserId !== userId) {
    needsIdentityReset = true;
    identityRevision++;
    clearAttribution();
  }
  currentUserId = userId;
  void initAnalytics()
    .then((ph) => {
      if (ph) syncIdentity(ph);
    })
    .catch(() => {});
}

function clearAttribution() {
  try {
    sessionStorage.removeItem("foodedo:attribution:v1");
  } catch {
    /* optional */
  }
}

export function reset(): void {
  if (currentUserId === null) return;
  currentUserId = null;
  needsIdentityReset = true;
  identityRevision++;
  clearAttribution();
  // Reset an existing SDK even when opted out; never load it just to reset.
  if (client)
    void client
      .then((ph) => {
        if (ph) syncIdentity(ph);
      })
      .catch(() => {});
}

// Idempotency keys stay local and never become event properties.
const saves = new Set<string>();
export function trackPlanSaved(
  planId: string,
  props: Events["plan_saved"],
  userId: string | null | undefined,
) {
  if (!analyticsEnabled() || saves.has(planId)) return;
  try {
    const key = `foodedo:plan-save-tracked:v1:${planId}`;
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, "1");
  } catch {
    /* in-memory guard still works */
  }
  saves.add(planId);
  track("plan_saved", props);
  rememberPlanVisit(planId, userId, false);
}
export function rememberPlanVisit(
  planId: string,
  userId: string | null | undefined,
  reportReturn = true,
) {
  if (!analyticsEnabled() || !userId) return;
  try {
    const key = `foodedo:plan-last-seen:v2:${encodeURIComponent(userId)}:${encodeURIComponent(planId)}`;
    const previous = Number(localStorage.getItem(key));
    const now = Date.now();
    localStorage.setItem(key, String(now));
    if (reportReturn && previous > 0 && now - previous >= 86_400_000)
      track("plan_returned", {
        days_since_last_visit: Math.floor((now - previous) / 86_400_000),
      });
  } catch {
    /* no retention metric when storage is unavailable */
  }
}
