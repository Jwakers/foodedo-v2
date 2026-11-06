import { expect, test } from "../helpers/fixture-test";
import {
  buildBrowserFixture,
  productionStylesheet,
} from "../helpers/browser-fixture";
import path from "node:path";
let javascript = "",
  stylesheet = "";
test.beforeAll(async () => {
  stylesheet = productionStylesheet();
  const fixture = path.resolve("tests/browser-fixtures/allergies");
  javascript = await buildBrowserFixture({
    entry: path.join(fixture, "entry.tsx"),
    name: "AllergyFixture",
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    resolve: {
      alias: {
        "@/features/auth/use-foodedo-auth": path.join(fixture, "auth.ts"),
        "@/features/household/household-context": path.join(
          fixture,
          "household.ts",
        ),
        "@": path.resolve("src"),
        "convex/react": path.join(fixture, "convex.ts"),
        "@clerk/react": path.join(fixture, "clerk.ts"),
        "next/navigation": path.resolve(
          "tests/browser-fixtures/household/navigation.ts",
        ),
        "next/link": path.resolve(
          "tests/browser-fixtures/catalogue-admin/link.tsx",
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
  await page.route("https://allergies.fixture/**", async (route) => {
    const url = new URL(route.request().url());
    await route.fulfill(
      url.pathname === "/app.js"
        ? { contentType: "application/javascript", body: javascript }
        : url.pathname === "/app.css"
          ? { contentType: "text/css", body: stylesheet }
          : {
              contentType: "text/html",
              body: '<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>',
            },
    );
  });
  await page.goto("https://allergies.fixture/");
});

test("guest search retains both nuts, pending edits survive Back, and only explicit save applies", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Search for an allergy").fill("nuts");
  await dialog.getByRole("button", { name: "Tree nuts", exact: true }).click();
  await expect(dialog.getByLabel("Search for an allergy")).toHaveValue("nuts");
  await dialog.getByRole("button", { name: "Peanuts", exact: true }).click();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("foodedo:guest-allergies:v1"),
    ),
  ).toBeNull();
  await dialog.getByRole("button", { name: "Back to plan settings" }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(
    dialog.getByRole("button", { name: "Remove Peanuts" }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Remove Tree nuts" }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Use allergies for this plan" })
    .click();
  await expect(dialog).not.toBeVisible();
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("foodedo:guest-allergies:v1")!),
    ),
  ).toEqual(["peanuts", "tree-nuts"]);
  expect(await page.evaluate(() => window.allergyFixture.counts.writes)).toBe(
    0,
  );
});

test("unrecognised search cannot be saved and keeps the query editable", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Search for an allergy").fill("Unknown product");
  await expect(dialog.getByText("No match found")).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Use allergies for this plan" }),
  ).toBeDisabled();
  await dialog.getByRole("button", { name: "Edit search" }).click();
  await expect(dialog.getByLabel("Search for an allergy")).toBeFocused();
  await expect(dialog.getByLabel("Search for an allergy")).toHaveValue(
    "Unknown product",
  );
  const target = await dialog
    .getByRole("button", { name: "Clear allergy search" })
    .boundingBox();
  expect(target!.width).toBeGreaterThanOrEqual(44);
  expect(target!.height).toBeGreaterThanOrEqual(44);
});

test("signed save retries preserve edits and sharing; warnings update without changing recipe layout", async ({
  page,
}) => {
  await page.evaluate(() =>
    window.allergyFixture.update({ signedIn: true, fail: true }),
  );
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Search for an allergy").fill("dairy");
  await dialog.getByRole("button", { name: /^Milk Includes/ }).click();
  await dialog.getByRole("switch").check();
  await expect(
    dialog.getByRole("button", { name: "Remove Milk" }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Save allergies" }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "changes are still here",
  );
  await expect(dialog.getByRole("switch")).toBeChecked();
  await page.evaluate(() => window.allergyFixture.update({ fail: false }));
  await dialog.getByRole("button", { name: "Save allergies" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByTestId("recipe-grid").getByText("Contains milk"),
  ).toBeVisible();
  await expect(
    page.getByText("In your allergies — check ingredient"),
  ).toHaveCount(1);
  expect(
    await page.evaluate(
      () => window.allergyFixture.read().profile.shareWithHousehold,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Manage", exact: true }).click();
  await expect(
    dialog.getByRole("button", { name: "Save allergies" }),
  ).toBeDisabled();
  await dialog.getByLabel("Search for an allergy").fill("eggs");
  await dialog.getByRole("button", { name: "Eggs", exact: true }).click();
  // The body scrolls while the save action stays inside a short viewport.
  await page.setViewportSize({ width: 390, height: 560 });
  const save = await dialog
    .getByRole("button", { name: "Save allergies" })
    .boundingBox();
  expect(save!.y).toBeGreaterThan(0);
  expect(save!.y + save!.height).toBeLessThanOrEqual(560);
  await page.screenshot({ path: "/private/tmp/foodedo-allergies-mobile.png" });
});

test("guest selections survive sign-in without replacing an existing profile", async ({
  page,
}) => {
  await page.evaluate(() => {
    localStorage.setItem(
      "foodedo:guest-allergies:v1",
      JSON.stringify(["peanuts"]),
    );
    window.dispatchEvent(new Event("foodedo:allergies"));
    window.allergyFixture.update({
      signedIn: true,
      profile: {
        allergenIds: ["milk"],
        effectiveIds: ["milk"],
        shareWithHousehold: true,
        revision: 2,
      },
    });
  });
  await page.getByRole("button", { name: "Manage", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("button", { name: "Save allergies" }),
  ).toBeDisabled();
  expect(await page.evaluate(() => window.allergyFixture.counts.writes)).toBe(
    0,
  );
  await dialog
    .getByRole("button", { name: "Add to my saved allergies" })
    .click();
  await expect(
    dialog.getByRole("button", { name: "Remove Milk" }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Remove Peanuts" }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Save allergies" }).click();
  await expect(dialog).not.toBeVisible();
  expect(
    await page.evaluate(() => window.allergyFixture.read().profile.allergenIds),
  ).toEqual(["milk", "peanuts"]);
  expect(
    await page.evaluate(() =>
      localStorage.getItem("foodedo:guest-allergies:v1"),
    ),
  ).toBeNull();
});

test("allergy management returns to the existing adjustment form with weekly edits intact", async ({
  page,
}) => {
  await page.evaluate(() => window.allergyFixture.update({ signedIn: true }));
  await page
    .getByRole("button", { name: "Edit this week", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Increase servings" }).click();
  await dialog.getByRole("button", { name: "5 days", exact: true }).click();
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await dialog.getByLabel("Search for an allergy").fill("dairy");
  await dialog.getByRole("button", { name: /^Milk Includes/ }).click();
  await dialog.getByRole("button", { name: "Save allergies" }).click();
  await expect(
    dialog.getByRole("heading", { name: "Edit this saved week" }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "5 days", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(dialog.getByRole("status")).toHaveText("5");
  await expect(
    dialog.getByText("Saved allergies", { exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => window.allergyFixture.counts.writes)).toBe(
    1,
  );
});

test("saving one guest selection keeps the other selections on this device", async ({
  page,
}) => {
  await page.evaluate(() => {
    localStorage.setItem(
      "foodedo:guest-allergies:v1",
      JSON.stringify(["peanuts", "garlic"]),
    );
    window.dispatchEvent(new Event("foodedo:allergies"));
    window.allergyFixture.update({
      signedIn: true,
      profile: {
        allergenIds: ["milk"],
        effectiveIds: ["milk"],
        shareWithHousehold: false,
        revision: 1,
      },
    });
  });
  await page.getByRole("button", { name: "Manage", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Search for an allergy").fill("peanuts");
  await dialog.getByRole("button", { name: "Peanuts", exact: true }).click();
  await dialog.getByRole("button", { name: "Save allergies" }).click();
  await expect(dialog).not.toBeVisible();
  expect(
    await page.evaluate(() => window.allergyFixture.read().profile.allergenIds),
  ).toEqual(["milk", "peanuts"]);
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("foodedo:guest-allergies:v1")!),
    ),
  ).toEqual(["garlic"]);
});

test("manual recipe picking shows known and uncertain allergy warnings", async ({
  page,
}) => {
  await page.evaluate(() => {
    localStorage.setItem(
      "foodedo:guest-allergies:v1",
      JSON.stringify(["milk"]),
    );
    window.dispatchEvent(new Event("foodedo:allergies"));
  });
  await page.getByRole("button", { name: "Open recipe picker" }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByText("Contains milk", { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByText("Check for milk", { exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Select Creamy potatoes", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Add Creamy potatoes", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  expect(
    await page.evaluate(() => window.allergyFixture.counts.choices),
  ).toEqual(["milk-meal"]);
});

test("an older guest panel cannot overwrite allergies saved in another tab", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Search for an allergy").fill("peanuts");
  await dialog.getByRole("button", { name: "Peanuts", exact: true }).click();
  await page.evaluate(() => {
    localStorage.setItem(
      "foodedo:guest-allergies:v1",
      JSON.stringify(["garlic"]),
    );
    window.dispatchEvent(new Event("storage"));
  });
  await dialog
    .getByRole("button", { name: "Use allergies for this plan" })
    .click();
  await expect(dialog.getByRole("alert")).toContainText("changed elsewhere");
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("foodedo:guest-allergies:v1")!),
    ),
  ).toEqual(["garlic"]);
  await dialog.getByRole("button", { name: "Back to plan settings" }).click();
  await page.getByRole("button", { name: "Manage", exact: true }).click();
  await expect(
    dialog.getByRole("button", { name: "Remove Garlic" }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Remove Peanuts" }),
  ).toHaveCount(0);
});

test("shared household warnings update without adding a partner’s allergies to the personal profile", async ({
  page,
}) => {
  await page.evaluate(() =>
    window.allergyFixture.update({
      signedIn: true,
      profile: {
        allergenIds: [],
        effectiveIds: ["milk"],
        shareWithHousehold: false,
        revision: 0,
      },
    }),
  );
  await expect(
    page.getByTestId("recipe-grid").getByText("Contains milk", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Manage", exact: true }).click();
  const panel = page.getByRole("dialog");
  await expect(
    panel.getByText("Household allergies also apply: Milk.", { exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByRole("button", { name: "Remove Milk", exact: true }),
  ).toHaveCount(0);
  await panel
    .getByRole("button", { name: "Close allergies", exact: true })
    .click();
  await page.evaluate(() =>
    window.allergyFixture.update({
      profile: {
        allergenIds: [],
        effectiveIds: [],
        shareWithHousehold: false,
        revision: 0,
      },
    }),
  );
  await expect(
    page.getByTestId("recipe-grid").getByText("Contains milk", { exact: true }),
  ).toHaveCount(0);
  expect(await page.evaluate(() => window.allergyFixture.counts.writes)).toBe(
    0,
  );
});
