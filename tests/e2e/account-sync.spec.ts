import { expect, test } from "../helpers/fixture-test";
import {
  buildBrowserFixture,
  productionStylesheet,
} from "../helpers/browser-fixture";
import path from "node:path";

let javascript = "";
let stylesheet = "";
test.beforeAll(async () => {
  stylesheet = productionStylesheet();
  const fixture = path.resolve("tests/browser-fixtures/account-sync");
  javascript = await buildBrowserFixture({
    define: {
      "process.env.NODE_ENV": JSON.stringify("development"),
      "process.env.SITE_URL": JSON.stringify("https://www.foodedo.com"),
      "process.env.NEXT_PUBLIC_SITE_URL": JSON.stringify(
        "https://www.foodedo.com",
      ),
      "process.env.NEXT_PUBLIC_POSTHOG_KEY": JSON.stringify(""),
      "process.env.NEXT_PUBLIC_CAPACITOR_BUILD": JSON.stringify("false"),
    },
    resolve: {
      alias: {
        "@/features/dashboard/dashboard": path.join(fixture, "dashboard.tsx"),
        "@": path.resolve("src"),
        "@clerk/react": path.join(fixture, "clerk.ts"),
        "convex/react": path.join(fixture, "convex.ts"),
        "next/navigation": path.join(fixture, "navigation.ts"),
        "next/link": path.resolve(
          "tests/browser-fixtures/catalogue-admin/link.tsx",
        ),
        "next/image": path.resolve(
          "tests/browser-fixtures/catalogue-admin/next.tsx",
        ),
      },
    },
    entry: path.join(fixture, "entry.tsx"),
    name: "AccountSyncFixture",
  });
});
test.beforeEach(async ({ page }) => {
  await page.route("https://account-sync.fixture/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/app.js")
      await route.fulfill({
        contentType: "application/javascript; charset=utf-8",
        body: javascript,
      });
    else if (pathname === "/app.css")
      await route.fulfill({ contentType: "text/css", body: stylesheet });
    else
      await route.fulfill({
        contentType: "text/html",
        body: '<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>',
      });
  });
});

test("new account waits without running personal queries, then automatically resumes", async ({
  page,
}) => {
  await page.goto("https://account-sync.fixture/");
  await expect(
    page.getByRole("heading", { name: "Preparing your Foodedo account" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => window.accountSyncFixture.counts.personalQueries),
  ).toBe(0);
  await page.evaluate(() =>
    window.accountSyncFixture.update({ account: { authSubject: "user-a" } }),
  );
  await expect(
    page.getByRole("heading", { name: "Signed-in app ready" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => window.accountSyncFixture.counts.personalQueries),
  ).toBeGreaterThan(0);
});

test("delayed setup offers retry and guest recovery while preserving the IndexedDB draft", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.install();
  await page.goto("https://account-sync.fixture/");
  await expect(
    page.getByRole("heading", { name: "Preparing your Foodedo account" }),
  ).toBeVisible();
  const draft = await page.evaluate(() =>
    window.accountSyncFixture.seedDraft(),
  );
  await page.clock.fastForward(10_001);
  await expect(
    page.getByRole("heading", {
      name: "Your account is taking a little longer",
    }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Get help" })).toHaveAttribute(
    "href",
    "https://www.foodedo.com/support/contact",
  );
  const guestButton = page.getByRole("button", {
    name: "Sign out and continue as guest",
  });
  const bounds = await guestButton.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.y + bounds!.height).toBeLessThan(844);
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => window.accountSyncFixture.counts.recoveries),
    )
    .toBe(2);
  expect(
    await page.evaluate(() => window.accountSyncFixture.readDraft()),
  ).toEqual(draft);
  await guestButton.click();
  await expect(page).toHaveURL("https://account-sync.fixture/?try=1");
  await expect(
    page.getByRole("heading", { name: "Guest planner ready" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => window.accountSyncFixture.readDraft()),
  ).toEqual(draft);
  expect(
    await page.evaluate(() => window.accountSyncFixture.counts.signOuts),
  ).toBe(1);
});

test("sign-out failure keeps recovery available and preserves the draft", async ({
  page,
}) => {
  await page.goto("https://account-sync.fixture/");
  await expect(
    page.getByRole("heading", { name: "Preparing your Foodedo account" }),
  ).toBeVisible();
  const draft = await page.evaluate(() =>
    window.accountSyncFixture.seedDraft(),
  );
  await page.evaluate(() =>
    window.accountSyncFixture.update({ signOutFails: true }),
  );
  const guestButton = page.getByRole("button", {
    name: "Sign out and continue as guest",
  });
  await guestButton.click();
  await expect(
    page.getByRole("alert").filter({ hasText: "We couldn’t sign you out" }),
  ).toBeVisible();
  await expect(guestButton).toBeEnabled();
  expect(
    await page.evaluate(() => window.accountSyncFixture.readDraft()),
  ).toEqual(draft);
});

test("another account cannot reuse the previous account's readiness", async ({
  page,
}) => {
  await page.goto("https://account-sync.fixture/");
  await page.evaluate(() =>
    window.accountSyncFixture.update({ account: { authSubject: "user-a" } }),
  );
  await expect(
    page.getByRole("heading", { name: "Signed-in app ready" }),
  ).toBeVisible();
  const before = await page.evaluate(
    () => window.accountSyncFixture.counts.personalQueries,
  );
  await page.evaluate(() =>
    window.accountSyncFixture.update({ userId: "user-b" }),
  );
  await expect(
    page.getByRole("region", { name: "Loading Foodedo" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => window.accountSyncFixture.counts.personalQueries),
  ).toBe(before);
  await page.evaluate(() =>
    window.accountSyncFixture.update({ account: { authSubject: "user-b" } }),
  );
  await expect(
    page.getByRole("heading", { name: "Signed-in app ready" }),
  ).toBeVisible();
});

test("guests can enter the planner without an account query or setup screen", async ({
  page,
}) => {
  await page.goto("https://account-sync.fixture/?scenario=guest");
  await expect(
    page.getByRole("heading", { name: "Guest planner ready" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => window.accountSyncFixture.counts.personalQueries),
  ).toBe(0);
  expect(
    await page.evaluate(() => window.accountSyncFixture.counts.recoveries),
  ).toBe(0);
});

test("a missing account recovers automatically without webhook delivery", async ({
  page,
}) => {
  await page.goto("https://account-sync.fixture/?scenario=recover");
  await expect(
    page.getByRole("heading", { name: "Signed-in app ready" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => window.accountSyncFixture.counts.recoveries),
  ).toBe(1);
});

test("failed recovery retries without reloading or losing the local draft", async ({
  page,
}) => {
  await page.goto("https://account-sync.fixture/");
  await expect(page.getByRole("alert")).toContainText(
    "We couldn’t prepare your account",
  );
  const draft = await page.evaluate(() =>
    window.accountSyncFixture.seedDraft(),
  );
  expect(
    await page.evaluate(() => window.accountSyncFixture.counts.recoveries),
  ).toBe(1);
  expect(
    await page.evaluate(() => window.accountSyncFixture.counts.personalQueries),
  ).toBe(0);
  await page.evaluate(() =>
    window.accountSyncFixture.update({ recovery: "succeed" }),
  );
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Signed-in app ready" }),
  ).toBeVisible();
  // The in-memory count would reset if retry reloaded the document.
  expect(
    await page.evaluate(() => window.accountSyncFixture.counts.recoveries),
  ).toBe(2);
  expect(
    await page.evaluate(() => window.accountSyncFixture.readDraft()),
  ).toEqual(draft);
});

for (const scenario of ["loading", "ready", "auth-loading"]) {
  test(`does not repair an account while ${scenario}`, async ({ page }) => {
    await page.goto(`https://account-sync.fixture/?scenario=${scenario}`);
    if (scenario === "loading") {
      await expect(
        page.getByRole("region", { name: "Loading Foodedo" }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Preparing your Foodedo account" }),
      ).toHaveCount(0);
    } else {
      await expect(page.getByRole("heading")).toBeVisible();
    }
    expect(
      await page.evaluate(() => window.accountSyncFixture.counts.recoveries),
    ).toBe(0);
    if (scenario === "loading") {
      expect(
        await page.evaluate(
          () => window.accountSyncFixture.counts.personalQueries,
        ),
      ).toBe(0);
      await page.evaluate(() =>
        window.accountSyncFixture.update({ account: null }),
      );
      await expect(page.getByRole("alert")).toBeVisible();
      expect(
        await page.evaluate(() => window.accountSyncFixture.counts.recoveries),
      ).toBe(1);
    }
  });
}

test("a pending repair cannot be submitted twice", async ({ page }) => {
  await page.clock.install();
  await page.goto("https://account-sync.fixture/?scenario=pending");
  await expect(
    page.getByRole("heading", { name: "Preparing your Foodedo account" }),
  ).toBeVisible();
  await page.clock.fastForward(10_001);
  await expect(
    page.getByRole("button", { name: "Preparing account…" }),
  ).toBeDisabled();
  expect(
    await page.evaluate(() => window.accountSyncFixture.counts.recoveries),
  ).toBe(1);
  expect(
    await page.evaluate(() => window.accountSyncFixture.counts.personalQueries),
  ).toBe(0);
  await page.evaluate(() => window.accountSyncFixture.completeRecovery());
  await expect(
    page.getByRole("heading", { name: "Signed-in app ready" }),
  ).toBeVisible();
});

test("a late repair cannot open the gate for a different account", async ({
  page,
}) => {
  await page.goto("https://account-sync.fixture/?scenario=pending");
  await expect(
    page.getByRole("heading", { name: "Preparing your Foodedo account" }),
  ).toBeVisible();
  await page.evaluate(() =>
    window.accountSyncFixture.update({
      userId: "user-b",
      account: undefined,
      recovery: "fail",
    }),
  );
  await page.evaluate(() => window.accountSyncFixture.completeRecovery());
  await expect(
    page.getByRole("region", { name: "Loading Foodedo" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => window.accountSyncFixture.counts.personalQueries),
  ).toBe(0);
  expect(
    await page.evaluate(() => window.accountSyncFixture.counts.recoveries),
  ).toBe(1);
  await page.evaluate(() =>
    window.accountSyncFixture.update({ account: null }),
  );
  await expect(page.getByRole("alert")).toBeVisible();
  expect(
    await page.evaluate(() => window.accountSyncFixture.counts.recoveries),
  ).toBe(2);
  await page.evaluate(() =>
    window.accountSyncFixture.update({ recovery: "succeed" }),
  );
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Signed-in app ready" }),
  ).toBeVisible();
});

test("Home keeps one loading presentation through session, account, household and plan hydration", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const navigations: string[] = [];
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) navigations.push(frame.url());
  });
  await page.goto("https://account-sync.fixture/?scenario=home");
  const loading = page.getByRole("region", { name: "Loading Foodedo" });
  await expect(loading).toBeVisible();
  const bounds = await loading.boundingBox();
  const stages = [
    {
      isLoaded: true,
      isSignedIn: true,
      isAuthenticated: false,
      isLoading: true,
    },
    { isAuthenticated: true, isLoading: false },
    { account: { authSubject: "user-a" } },
    { household: null },
  ];
  for (const stage of stages) {
    await page.evaluate(
      (next) => window.accountSyncFixture.update(next),
      stage,
    );
    await expect(loading).toBeVisible();
    expect(await loading.boundingBox()).toEqual(bounds);
    await expect(
      page.getByRole("heading", { name: "Make food decisions easier." }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Preparing your Foodedo account" }),
    ).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Primary" })).toHaveCount(
      0,
    );
    await expect(page.locator("header")).toHaveCount(0);
  }
  expect(
    await page.evaluate(() => window.accountSyncFixture.counts.recoveries),
  ).toBe(0);
  await page.evaluate(() =>
    window.accountSyncFixture.update({ plan: { _id: "saved-plan" } }),
  );
  await expect(
    page.getByRole("heading", { name: "What sounds good?" }),
  ).toBeVisible();
  await expect(loading).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
  expect(navigations).toEqual(["https://account-sync.fixture/?scenario=home"]);
});

test("slow unresolved account loading still offers recovery without provisioning", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto("https://account-sync.fixture/?scenario=loading");
  await expect(
    page.getByRole("region", { name: "Loading Foodedo" }),
  ).toBeVisible();
  const draft = await page.evaluate(() =>
    window.accountSyncFixture.seedDraft(),
  );
  await page.clock.fastForward(10_001);
  await expect(
    page.getByRole("heading", {
      name: "Your account is taking a little longer",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Try again", exact: true }),
  ).toBeDisabled();
  expect(
    await page.evaluate(() => window.accountSyncFixture.counts.recoveries),
  ).toBe(0);
  await page
    .getByRole("button", { name: "Sign out and continue as guest" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Guest planner ready" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => window.accountSyncFixture.readDraft()),
  ).toEqual(draft);
});

for (const stalledStage of ["session", "token", "household", "plan"] as const) {
  test(`stalled Home ${stalledStage} offers recovery and automatically completes on a late response`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 740 });
    await page.clock.install({ time: new Date("2030-01-01T00:00:00Z") });
    await page.clock.pauseAt(new Date("2030-01-01T00:00:01Z"));
    await page.goto("https://account-sync.fixture/?scenario=home");
    if (stalledStage !== "session") {
      await page.evaluate(
        (stage) =>
          window.accountSyncFixture.update({
            isLoaded: true,
            isSignedIn: true,
            isAuthenticated: stage !== "token",
            isLoading: stage === "token",
            account: stage === "token" ? undefined : { authSubject: "user-a" },
            household: stage === "plan" ? null : undefined,
          }),
        stalledStage,
      );
    }
    const draft = await page.evaluate(() =>
      window.accountSyncFixture.seedDraft(),
    );
    const loading = page.getByRole("region", { name: "Loading Foodedo" });
    await expect(loading).toHaveAttribute("aria-busy", "true");
    await page.clock.fastForward(9_999);
    const retry = page.getByRole("button", { name: "Try again", exact: true });
    await expect(retry).toHaveCount(0);
    await page.clock.fastForward(2);
    await expect(
      page.getByRole("heading", { name: "Foodedo is taking a little longer" }),
    ).toBeVisible();
    await expect(loading).toHaveAttribute("aria-busy", "false");
    await expect(retry).toBeEnabled();
    await expect(
      page.getByRole("link", { name: "Browse recipes", exact: true }),
    ).toHaveAttribute("href", "/recipes");
    await expect(
      page.getByRole("heading", { name: "Make food decisions easier." }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Preparing your Foodedo account" }),
    ).toHaveCount(0);
    expect(
      await page.evaluate(() => window.accountSyncFixture.counts.recoveries),
    ).toBe(0);
    expect(
      await page.evaluate(() => window.accountSyncFixture.readDraft()),
    ).toEqual(draft);
    const bounds = await retry.boundingBox();
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(740);

    await page.evaluate(() =>
      window.accountSyncFixture.update({
        isLoaded: true,
        isSignedIn: true,
        isAuthenticated: true,
        isLoading: false,
        account: { authSubject: "user-a" },
        household: null,
        plan: { _id: "saved-plan" },
      }),
    );
    await expect(
      page.getByRole("heading", { name: "What sounds good?" }),
    ).toBeVisible();
    await expect(loading).toHaveCount(0);
    await expect(
      page.getByRole("navigation", { name: "Primary" }),
    ).toBeVisible();
  });
}

test("retrying stalled Home reloads without discarding the local draft", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto("https://account-sync.fixture/?scenario=home");
  const draft = await page.evaluate(() =>
    window.accountSyncFixture.seedDraft(),
  );
  await page.clock.fastForward(10_001);
  await expect(
    page.getByRole("heading", { name: "Foodedo is taking a little longer" }),
  ).toBeVisible();
  await Promise.all([
    page.waitForEvent("framenavigated", (frame) => frame === page.mainFrame()),
    page.getByRole("button", { name: "Try again", exact: true }).click(),
  ]);
  await expect(
    page.getByRole("region", { name: "Loading Foodedo" }),
  ).toHaveAttribute("aria-busy", "true");
  expect(
    await page.evaluate(() => window.accountSyncFixture.readDraft()),
  ).toEqual(draft);
  await expect(
    page.getByRole("heading", { name: "Foodedo is taking a little longer" }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(() => window.accountSyncFixture.counts.recoveries),
  ).toBe(0);
});

test("Home shows Welcome only after guest resolution and restores the guest app after refresh", async ({
  page,
}) => {
  await page.goto("https://account-sync.fixture/?scenario=home");
  await expect(
    page.getByRole("region", { name: "Loading Foodedo" }),
  ).toBeVisible();
  await page.evaluate(() =>
    window.accountSyncFixture.update({ isLoaded: true, userId: null }),
  );
  await expect(
    page.getByRole("heading", { name: "Make food decisions easier." }),
  ).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary" })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Try Foodedo" }).click();
  await expect(
    page.getByRole("heading", { name: "Dinner, decided." }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("region", { name: "Loading Foodedo" }),
  ).toBeVisible();
  await page.evaluate(() =>
    window.accountSyncFixture.update({ isLoaded: true, userId: null }),
  );
  await expect(
    page.getByRole("heading", { name: "Dinner, decided." }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Make food decisions easier." }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(() => window.accountSyncFixture.counts.personalQueries),
  ).toBe(0);
});

test("signing out during recovery keeps the guest draft and ignores a late repair", async ({
  page,
}) => {
  await page.goto("https://account-sync.fixture/?scenario=pending");
  await expect(
    page.getByRole("heading", { name: "Preparing your Foodedo account" }),
  ).toBeVisible();
  const draft = await page.evaluate(() =>
    window.accountSyncFixture.seedDraft(),
  );
  await page
    .getByRole("button", { name: "Sign out and continue as guest" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Guest planner ready" }),
  ).toBeVisible();
  await page.evaluate(() => window.accountSyncFixture.completeRecovery());
  await expect(
    page.getByRole("heading", { name: "Guest planner ready" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => window.accountSyncFixture.counts.personalQueries),
  ).toBe(0);
  expect(
    await page.evaluate(() => window.accountSyncFixture.readDraft()),
  ).toEqual(draft);
});

test("a deleted account offers guest recovery without retrying provisioning", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto("https://account-sync.fixture/?scenario=deleted");
  await expect(
    page.getByRole("heading", { name: "This account has been deleted" }),
  ).toBeVisible();
  const draft = await page.evaluate(() =>
    window.accountSyncFixture.seedDraft(),
  );
  await page.clock.fastForward(10_001);
  await expect(
    page.getByRole("button", { name: "Try again", exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(() => window.accountSyncFixture.counts.recoveries),
  ).toBe(1);
  expect(
    await page.evaluate(() => window.accountSyncFixture.counts.personalQueries),
  ).toBe(0);
  await page
    .getByRole("button", { name: "Sign out and continue as guest" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Guest planner ready" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => window.accountSyncFixture.readDraft()),
  ).toEqual(draft);
  await page.evaluate(() =>
    window.accountSyncFixture.update({
      isSignedIn: true,
      isAuthenticated: true,
      userId: "user-b",
      account: null,
      recovery: "succeed",
    }),
  );
  await expect(
    page.getByRole("heading", { name: "Signed-in app ready" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => window.accountSyncFixture.counts.recoveries),
  ).toBe(2);
});
