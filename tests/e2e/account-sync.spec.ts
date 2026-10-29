import { expect, test, type Page } from "@playwright/test";
import { build } from "vite";
import path from "node:path";
import { readFileSync, readdirSync } from "node:fs";

const pageErrors = new WeakMap<Page, string[]>();
let javascript = "";
let stylesheet = "";
test.beforeAll(async () => {
  const cssRoot = path.resolve(".next/static/css");
  stylesheet = readdirSync(cssRoot, { recursive: true })
    .filter((file) => String(file).endsWith(".css"))
    .map((file) => readFileSync(path.join(cssRoot, String(file)), "utf8"))
    .join("\n");
  const fixture = path.resolve("tests/browser-fixtures/account-sync");
  const result = await build({
    configFile: false,
    logLevel: "error",
    define: {
      "process.env.NODE_ENV": JSON.stringify("development"),
      "process.env.SITE_URL": JSON.stringify("https://www.foodedo.com"),
      "process.env.NEXT_PUBLIC_SITE_URL": JSON.stringify(
        "https://www.foodedo.com",
      ),
    },
    resolve: {
      alias: {
        "@": path.resolve("src"),
        "@clerk/react": path.join(fixture, "clerk.ts"),
        "convex/react": path.join(fixture, "convex.ts"),
        "next/navigation": path.join(fixture, "navigation.ts"),
        "next/link": path.resolve(
          "tests/browser-fixtures/catalogue-admin/link.tsx",
        ),
      },
    },
    build: {
      write: false,
      minify: false,
      lib: {
        entry: path.join(fixture, "entry.tsx"),
        formats: ["iife"],
        name: "AccountSyncFixture",
      },
    },
  });
  const bundle = Array.isArray(result) ? result[0] : result;
  if (!("output" in bundle)) throw new Error("Expected browser fixture bundle");
  javascript = bundle.output
    .filter((item) => item.type === "chunk")
    .map((item) => item.code)
    .join("\n");
});
test.afterEach(async ({ page }) => {
  expect(pageErrors.get(page)).toEqual([]);
});
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
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
    page.getByRole("heading", { name: "Preparing your Foodedo account" }),
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
    await expect(page.getByRole("heading")).toBeVisible();
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
    page.getByRole("heading", { name: "Preparing your Foodedo account" }),
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
