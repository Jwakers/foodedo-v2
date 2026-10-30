import path from "node:path";
import { expect, test } from "../helpers/fixture-test";
import { buildBrowserFixture } from "../helpers/browser-fixture";
let javascript = "";
test.beforeAll(async () => {
  const state = path.resolve(
    "tests/browser-fixtures/shopping-preparation/state.ts",
  );
  javascript = await buildBrowserFixture({
    entry: path.resolve(
      "tests/browser-fixtures/shopping-preparation/entry.tsx",
    ),
    name: "PreparationFixture",
    define: { "process.env.NODE_ENV": JSON.stringify("development") },
    resolve: {
      alias: {
        "@/features/household/household-context": state,
        "@": path.resolve("src"),
        "convex/react": state,
      },
    },
  });
});
test.beforeEach(async ({ page }) => {
  await page.route("https://preparation.fixture/**", async (route) => {
    await route.fulfill(
      new URL(route.request().url()).pathname === "/app.js"
        ? {
            contentType: "application/javascript; charset=utf-8",
            body: javascript,
          }
        : {
            contentType: "text/html; charset=utf-8",
            body: '<div id="root"></div><script src="/app.js"></script>',
          },
    );
  });
  await page.goto("https://preparation.fixture/");
});
test("Strict Mode shares the automatic attempt and an explicit retry starts a new one", async ({
  page,
}) => {
  await expect
    .poll(() => page.evaluate(() => window.preparationFixture.requests))
    .toEqual(["alice:private"]);
  await page.evaluate(() =>
    window.preparationFixture.finish(0, "plan_unavailable"),
  );
  await expect(page.getByRole("status")).toContainText(
    "can’t be turned into a list",
  );
  await page.getByRole("button", { name: "Retry" }).click();
  await expect
    .poll(() => page.evaluate(() => window.preparationFixture.requests.length))
    .toBe(2);
  await expect(page.getByRole("status")).toHaveText("Preparing");
  await page.evaluate(() => window.preparationFixture.finish(1, "ready"));
  await expect(page.getByRole("status")).toHaveText("Ready");
});
test("a late preparation result cannot replace another space or plan's state", async ({
  page,
}) => {
  await page.evaluate(() => window.preparationFixture.select("bob:new-plan"));
  await expect
    .poll(() => page.evaluate(() => window.preparationFixture.requests))
    .toEqual(["alice:private", "bob:new-plan"]);
  await page.evaluate(() => window.preparationFixture.select("alice:private"));
  await expect
    .poll(() => page.evaluate(() => window.preparationFixture.requests))
    .toEqual(["alice:private", "bob:new-plan", "alice:private"]);
  await page.evaluate(() =>
    window.preparationFixture.finish(0, "plan_unavailable"),
  );
  await expect(page.getByRole("status")).toHaveText("Preparing");
  await page.evaluate(() => window.preparationFixture.finish(2, "ready"));
  await expect(page.getByRole("status")).toHaveText("Ready");
});
