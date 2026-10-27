import { expect, test } from "@playwright/test";
import {
  attribution,
  identify,
  initAnalytics,
  reset,
  safePath,
  track,
  trackPlanSaved,
  rememberPlanVisit,
} from "../../src/lib/analytics";

test("analytics is a no-op without a key, even in a browser", async () => {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {},
  });
  try {
    expect(await initAnalytics()).toBeNull();
    expect(() => {
      track("try_foodedo_clicked", {
        source_path: "/",
        cta_location: "landing_hero",
      });
      identify("test-account");
      reset();
      trackPlanSaved(
        "test-plan",
        { is_guest_claim: true, meal_count: 7 },
        "user-a",
      );
      rememberPlanVisit("test-plan", "user-a");
    }).not.toThrow();
    // No DOM, storage or SDK access is needed to finish any deferred work.
    await Promise.resolve();
  } finally {
    if (key === undefined) delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
    else process.env.NEXT_PUBLIC_POSTHOG_KEY = key;
    if (descriptor) Object.defineProperty(globalThis, "window", descriptor);
    else Reflect.deleteProperty(globalThis, "window");
  }
});

for (const host of [
  "www.google.com",
  "www.google.co.uk",
  "google.de",
  "www.bing.com",
  "duckduckgo.com",
  "www.ecosia.org",
  "search.yahoo.com",
]) {
  test(`recognises organic search from ${host}`, () => {
    const props = attribution(
      "https://www.foodedo.com/recipes?try=1",
      `https://${host}/search?q=private+query`,
    );
    expect(props.is_organic_search).toBe(true);
    expect(props.first_referrer).toBe(`https://${host}`);
    expect(props.first_landing_path).toBe("/recipes");
  });
}
for (const referrer of [
  "",
  "invalid",
  "https://google.com.attacker.example",
  "https://notgoogle.com",
  "https://www.foodedo.com/blog/a",
  "https://facebook.com/",
]) {
  test(`does not classify ${referrer || "direct"} as organic`, () => {
    expect(
      attribution("https://www.foodedo.com/", referrer).is_organic_search,
    ).toBe(false);
  });
}
test("any UTM disqualifies organic search, even an empty or filtered UTM", () => {
  for (const query of [
    "utm_source=google",
    "utm_medium=",
    "utm_campaign=user%40example.com",
    "utm_content=example",
  ]) {
    expect(
      attribution(`https://www.foodedo.com/?${query}`, "https://google.com/")
        .is_organic_search,
    ).toBe(false);
  }
});
test("attribution stores bounded campaign labels and omits queries, fragments and personal data", () => {
  const props = attribution(
    "https://www.foodedo.com/blog/a?utm_source=search&utm_medium=organic&utm_campaign=autumn_2026&email=private#secret",
    "https://www.google.co.uk/search?q=private",
  );
  expect(props).toMatchObject({
    utm_source: "search",
    utm_medium: "organic",
    utm_campaign: "autumn_2026",
    first_landing_path: "/blog/a",
    first_referrer: "https://www.google.co.uk",
  });
  expect(JSON.stringify(props)).not.toContain("private");
  expect(
    attribution(
      "https://www.foodedo.com/?utm_campaign=person%40example.com",
      "",
    ).utm_campaign,
  ).toBe("");
  expect(safePath("/household/join/private-token?email=private#secret")).toBe(
    "/household/join/[token]",
  );
  expect(safePath("/recipes/view?recipeId=private")).toBe("/recipes/view");
});
