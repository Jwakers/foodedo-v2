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
  javascript = await buildBrowserFixture({
    entry: path.resolve("tests/browser-fixtures/cook-ingredients/entry.tsx"),
    name: "CookIngredientsFixture",
    define: {
      "process.env.NODE_ENV": JSON.stringify("production"),
      "process.env.NEXT_PUBLIC_CAPACITOR_BUILD": JSON.stringify("false"),
      "process.env": "{}",
    },
    resolve: {
      alias: {
        "@": path.resolve("src"),
        "next/navigation": path.resolve(
          "tests/browser-fixtures/cook-ingredients/navigation.ts",
        ),
        "next/image": path.resolve(
          "tests/browser-fixtures/catalogue-admin/next.tsx",
        ),
      },
    },
  });
});
test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("https://cook.fixture/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    await route.fulfill(
      pathname === "/app.js"
        ? { contentType: "application/javascript", body: javascript }
        : pathname === "/app.css"
          ? { contentType: "text/css", body: stylesheet }
          : {
              contentType: "text/html",
              body: '<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/app.css"><style>:root{--font-dm-sans:Arial;--font-fraunces:Georgia}</style></head><body><div id="root"></div><script src="/app.js"></script></body></html>',
            },
    );
  });
});

test("Cook shows scaled amounts and notes through navigation while timers keep running", async ({
  page,
}, testInfo) => {
  await page.goto("https://cook.fixture/");
  await page.getByRole("button", { name: "I’m ready, start cooking" }).click();
  const ingredients = page.getByRole("region", {
    name: "Ingredients for this step",
  });
  await expect(ingredients).toContainText("2 onions");
  await expect(ingredients).toContainText("finely chopped");
  await expect(ingredients).toContainText("1 tsp ground coriander");
  await expect(page.locator("mark")).toHaveText(["onion", "ground coriander"]);
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 390);
  await page.screenshot({
    path: testInfo.outputPath("cook-ingredients-mobile.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: /Start 0:30 timer/ }).click();
  await page.getByRole("button", { name: "Next step" }).click();
  await expect(ingredients).toContainText("4 tbsp olive oil");
  await expect(ingredients).toContainText(
    "Quantities shown are recipe totals.",
  );
  await page.getByRole("button", { name: "Show ingredients" }).click();
  await expect(
    page.getByRole("heading", { name: "Ingredients", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back to cooking" }).click();
  await expect(page.getByText("Step 2 of 3")).toBeVisible();
  await page.getByRole("button", { name: "Simulate backend update" }).click();
  await expect(page.getByText("Step 2 of 3")).toBeVisible();
  await expect(page.getByText("changed after cook started")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Pause", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Next step" }).click();
  await expect(ingredients).toHaveCount(0);
  await expect(page.locator("mark")).toHaveCount(0);
});

test("Cook keeps ambiguous spice amounts out of the confirmed list", async ({
  page,
}) => {
  await page.goto("https://cook.fixture/?ambiguous=1");
  await page.getByRole("button", { name: "I’m ready, start cooking" }).click();
  await expect(
    page.getByRole("region", { name: "Ingredients for this step" }),
  ).toHaveCount(0);
  await expect(page.locator("mark")).toHaveCount(0);
  const reference = page.getByRole("region", { name: "Ingredient reference" });
  await expect(reference).toBeVisible();
  await expect(reference).toContainText("1 tsp ground coriander");
  await expect(reference).toContainText("2 bunch fresh coriander");
  await expect(reference).toContainText("roughly chopped");
  await expect(
    page.getByText("Check ingredient amounts", { exact: true }),
  ).toHaveCount(0);
});
