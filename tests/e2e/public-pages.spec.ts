import { expect, test } from "@playwright/test";
import pages from "../../src/features/public-pages/pages.json";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

test("full legacy public URL inventory passes the production audit", async () => {
  test.setTimeout(180_000);
  await promisify(execFile)(process.execPath, [
    "scripts/audit-public-urls.mjs",
  ]);
});

test("all restored URLs are readable without JavaScript", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  for (const entry of pages) {
    const response = await page.goto(`http://127.0.0.1:3100${entry.path}`);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      entry.title,
    );
    await expect(page.getByRole("main")).toContainText(entry.sections[0].body);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      new RegExp(`${entry.path}$`),
    );
  }
  await context.close();
});

test("mobile editorial navigation fits, skip link works and CTA enters guest planning", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/recipe-to-shopping-list");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Turn recipes into one shopping list",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#editorial-content$/);
  await page
    .getByRole("link", { name: "Try Foodedo", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("button", { name: "Plan my week", exact: true }),
  ).toBeVisible();
});

test("pricing stays temporary and contact is restored", async ({ request }) => {
  const pricing = await request.get("/pricing?from=old", { maxRedirects: 0 });
  expect(pricing.status()).toBe(307);
  expect(pricing.headers().location).toBe("/faq?from=old");
  expect((await request.get("/support/contact")).status()).toBe(200);
  expect(
    (await request.get("/public-migration-definitely-missing-page")).status(),
  ).toBe(404);
});
