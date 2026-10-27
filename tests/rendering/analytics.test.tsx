// @vitest-environment node
import { afterEach, beforeEach, expect, test, vi } from "vitest";
const sdk = vi.hoisted(() => ({
  init: vi.fn(),
  register_once: vi.fn(),
  capture: vi.fn(),
  identify: vi.fn(),
  reset: vi.fn(),
  debug: vi.fn(),
  opt_out_capturing: vi.fn(),
  opt_in_capturing: vi.fn(),
}));
vi.mock("posthog-js", () => ({ default: sdk }));

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "test-key");
  vi.stubEnv("NEXT_PUBLIC_CAPACITOR_BUILD", "false");
  vi.stubGlobal(
    "window",
    Object.assign(new EventTarget(), {
      location: {
        href: "https://www.foodedo.com/blog/example",
        pathname: "/blog/example",
      },
    }),
  );
  vi.stubGlobal("document", {
    referrer: "https://www.google.co.uk/search?q=private",
  });
  vi.stubGlobal("navigator", { doNotTrack: "0" });
  vi.stubGlobal("localStorage", storage());
  vi.stubGlobal("sessionStorage", storage());
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

test("concurrent callers initialise once with the privacy settings and retain attribution through identify", async () => {
  const analytics = await import("../../src/lib/analytics");
  analytics.track("$pageview", { path: "/blog/example", page_type: "article" });
  analytics.identify("clerk-user-id");
  await analytics.initAnalytics();
  expect(sdk.init).toHaveBeenCalledTimes(1);
  expect(sdk.init.mock.calls[0][1]).toMatchObject({
    api_host: "/ingest",
    persistence: "memory",
    capture_pageview: false,
    capture_pageleave: true,
    autocapture: false,
    disable_session_recording: true,
    person_profiles: "identified_only",
    respect_dnt: true,
    ip: false,
  });
  expect(sdk.register_once).toHaveBeenCalledWith(
    expect.objectContaining({
      first_landing_path: "/blog/example",
      first_referrer: "https://www.google.co.uk",
      is_organic_search: true,
    }),
  );
  expect(sdk.identify).toHaveBeenCalledExactlyOnceWith("clerk-user-id");
  expect(sdk.reset).not.toHaveBeenCalled();
  const sanitize = sdk.init.mock.calls[0][1].before_send;
  const event = sanitize({
    properties: {
      distinct_id: "clerk-user-id",
      path: "/recipes",
      $current_url: "https://example.com/?email=private",
      $referrer: "private",
      $set_once: { $initial_current_url: "private" },
      email: "private",
      recipe_text: "private",
      is_organic_search: true,
    },
  });
  expect(event.properties).toEqual({
    distinct_id: "clerk-user-id",
    path: "/recipes",
    is_organic_search: true,
    $geoip_disable: true,
  });
});

test("save acknowledgements dedupe across retries and module remounts; returns require a 24h gap", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-27T12:00:00Z"));
  const analytics = await import("../../src/lib/analytics");
  const props = { is_guest_claim: true, meal_count: 7 };
  analytics.trackPlanSaved("plan-a", props, "user-a");
  analytics.trackPlanSaved("plan-a", props, "user-a");
  await analytics.initAnalytics();
  expect(
    sdk.capture.mock.calls.filter(([name]) => name === "plan_saved"),
  ).toHaveLength(1);
  analytics.rememberPlanVisit("plan-a", "user-a");
  await analytics.initAnalytics();
  expect(
    sdk.capture.mock.calls.filter(([name]) => name === "plan_returned"),
  ).toHaveLength(0);
  vi.setSystemTime(new Date("2026-10-28T12:00:00Z"));
  analytics.rememberPlanVisit("plan-a", "user-a");
  analytics.rememberPlanVisit("plan-a", "user-a");
  await analytics.initAnalytics();
  expect(
    sdk.capture.mock.calls.filter(([name]) => name === "plan_returned"),
  ).toEqual([["plan_returned", { days_since_last_visit: 1 }]]);
  vi.resetModules();
  const remounted = await import("../../src/lib/analytics");
  remounted.trackPlanSaved("plan-a", props, "user-a");
  expect(
    sdk.capture.mock.calls.filter(([name]) => name === "plan_saved"),
  ).toHaveLength(1);
});

test.each(["missing-key", "DNT", "native", "opt-out"])(
  "%s suppresses SDK loading and local plan storage",
  async (reason) => {
    if (reason === "missing-key") vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "");
    if (reason === "DNT") vi.stubGlobal("navigator", { doNotTrack: "1" });
    if (reason === "native") vi.stubEnv("NEXT_PUBLIC_CAPACITOR_BUILD", "true");
    if (reason === "opt-out")
      localStorage.setItem("foodedo:analytics-opt-out", "true");
    const analytics = await import("../../src/lib/analytics");
    analytics.trackPlanSaved(
      "plan-a",
      { is_guest_claim: true, meal_count: 7 },
      "user-a",
    );
    analytics.identify("clerk-user-id");
    expect(await analytics.initAnalytics()).toBeNull();
    expect(sdk.init).not.toHaveBeenCalled();
    expect(
      localStorage.getItem("foodedo:plan-last-seen:v2:user-a:plan-a"),
    ).toBeNull();
  },
);

test("opted-out sign-out resets the existing SDK and re-enable cannot resume the old account", async () => {
  const analytics = await import("../../src/lib/analytics");
  analytics.identify("user-a");
  await analytics.initAnalytics();
  analytics.setAnalyticsOptOut(true);
  await Promise.resolve();
  analytics.reset();
  await Promise.resolve();
  expect(sdk.reset).toHaveBeenCalledTimes(1);
  analytics.identify("user-b");
  await Promise.resolve();
  expect(sdk.identify.mock.calls).toEqual([["user-a"]]);
  analytics.setAnalyticsOptOut(false);
  analytics.track("shopping_list_viewed", {});
  await analytics.initAnalytics();
  expect(sdk.identify.mock.calls).toEqual([["user-a"], ["user-b"]]);
  expect(sdk.opt_in_capturing).toHaveBeenCalledWith({
    captureEventName: false,
  });
  expect(sdk.identify.mock.invocationCallOrder[1]).toBeLessThan(
    sdk.capture.mock.invocationCallOrder[0],
  );
});

test("a direct account switch while opted out is applied before capture resumes", async () => {
  const analytics = await import("../../src/lib/analytics");
  analytics.identify("user-a");
  await analytics.initAnalytics();
  analytics.setAnalyticsOptOut(true);
  await Promise.resolve();
  analytics.identify("user-b");
  analytics.setAnalyticsOptOut(false);
  analytics.track("shopping_list_viewed", {});
  await analytics.initAnalytics();
  expect(sdk.reset).toHaveBeenCalledTimes(1);
  expect(sdk.identify.mock.calls).toEqual([["user-a"], ["user-b"]]);
  expect(sdk.reset.mock.invocationCallOrder[0]).toBeLessThan(
    sdk.opt_in_capturing.mock.invocationCallOrder[0],
  );
  expect(sdk.identify.mock.invocationCallOrder[1]).toBeLessThan(
    sdk.capture.mock.invocationCallOrder[0],
  );
});

test("initial opt-out still permits identity synchronisation on first opt-in", async () => {
  localStorage.setItem("foodedo:analytics-opt-out", "true");
  const analytics = await import("../../src/lib/analytics");
  analytics.identify("user-b");
  expect(await analytics.initAnalytics()).toBeNull();
  expect(sdk.init).not.toHaveBeenCalled();
  analytics.setAnalyticsOptOut(false);
  analytics.track("shopping_list_viewed", {});
  await analytics.initAnalytics();
  expect(sdk.identify).toHaveBeenCalledExactlyOnceWith("user-b");
  expect(sdk.identify.mock.invocationCallOrder[0]).toBeLessThan(
    sdk.capture.mock.invocationCallOrder[0],
  );
});

test("shared-plan return timestamps are independent for each account and ignore legacy storage", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-27T12:00:00Z"));
  const analytics = await import("../../src/lib/analytics");
  localStorage.setItem(
    "foodedo:plan-last-seen:v1:shared-plan",
    String(Date.now() - 172_800_000),
  );
  analytics.rememberPlanVisit("shared-plan", "user-a");
  await analytics.initAnalytics();
  vi.setSystemTime(new Date("2026-10-28T12:00:00Z"));
  analytics.rememberPlanVisit("shared-plan", "user-b");
  analytics.rememberPlanVisit("shared-plan", null);
  await analytics.initAnalytics();
  expect(sdk.capture).not.toHaveBeenCalled();
  analytics.rememberPlanVisit("shared-plan", "user-a");
  analytics.rememberPlanVisit("shared-plan", "user-a");
  await analytics.initAnalytics();
  expect(sdk.capture.mock.calls).toEqual([
    ["plan_returned", { days_since_last_visit: 1 }],
  ]);
  expect(
    localStorage.getItem("foodedo:plan-last-seen:v2:user-b:shared-plan"),
  ).toBe(String(Date.now()));
});
