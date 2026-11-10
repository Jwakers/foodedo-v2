import path from "node:path";
import { expect, test } from "../helpers/fixture-test";
import { buildBrowserFixture } from "../helpers/browser-fixture";

let javascript = "";
test.beforeAll(async () => {
  const fixture = path.resolve("tests/browser-fixtures/import-permission");
  const state = path.join(fixture, "state.ts");
  javascript = await buildBrowserFixture({
    entry: path.join(fixture, "entry.tsx"),
    name: "ImportPermissionFixture",
    define: {
      "process.env.NODE_ENV": JSON.stringify("development"),
      "process.env.NEXT_PUBLIC_CAPACITOR_BUILD": JSON.stringify("true"),
    },
    resolve: {
      alias: {
        "@/features/auth/use-foodedo-auth": state,
        "@": path.resolve("src"),
        "convex/react": state,
        "next/navigation": state,
      },
    },
  });
});

test("declining native sign-in continuation preserves its source and retry requires fresh permission", async ({
  page,
}) => {
  await page.route("https://import-permission.fixture/**", (route) =>
    route.fulfill(
      route.request().url().endsWith("app.js")
        ? {
            contentType: "application/javascript; charset=utf-8",
            body: javascript,
          }
        : {
            contentType: "text/html; charset=utf-8",
            body: '<div id="root"></div><script src="/app.js"></script>',
          },
    ),
  );
  page.once("dialog", async (dialog) => {
    const notice = dialog.message();
    await dialog.dismiss();
    expect(notice).toContain("OpenAI through Vercel");
    expect(notice).toContain("Apify");
  });
  await page.goto("https://import-permission.fixture/");
  await expect(
    page.getByText("Recipe import paused", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => window.importPermissionFixture.calls.length),
  ).toBe(0);
  expect(
    await page.evaluate(() => window.importPermissionFixture.read()),
  ).toMatchObject({
    source: { type: "url", url: "https://example.com/recipe" },
  });
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Try again" }).click();
  await expect
    .poll(() => page.evaluate(() => window.importPermissionFixture.navigation))
    .toEqual(["/recipes/import?job=fixture-import"]);
  expect(
    await page.evaluate(() => window.importPermissionFixture.calls.length),
  ).toBe(1);
  expect(
    await page.evaluate(() => window.importPermissionFixture.read()),
  ).toBeNull();
});
