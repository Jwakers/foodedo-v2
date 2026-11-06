import { expect, test, type Page } from "@playwright/test";
import { ConvexHttpClient } from "convex/browser";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import { isAllergyEligible } from "../../src/lib/domain/allergies";
import type { GuestDraft } from "../../src/lib/domain/guest-draft";

let catalogue: NonNullable<FunctionReturnType<typeof api.catalogue.getCurrent>>;
// These journeys use the running app and its public catalogue, with a fresh
// guest browser context. Account/household failure cases live in allergies.spec.
test.beforeAll(async () => {
  const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  const current = await client.query(api.catalogue.getCurrent, {});
  if (!current)
    throw new Error(
      "A published catalogue is required for the live allergy journeys.",
    );
  catalogue = current;
});

async function storedDrafts(page: Page): Promise<GuestDraft[]> {
  return page.evaluate(async () => {
    if (!(await indexedDB.databases()).some((db) => db.name === "foodedo"))
      return [];
    return new Promise((resolve, reject) => {
      const open = indexedDB.open("foodedo");
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        if (!db.objectStoreNames.contains("guest-drafts")) {
          db.close();
          resolve([]);
          return;
        }
        const request = db
          .transaction("guest-drafts", "readonly")
          .objectStore("guest-drafts")
          .getAll();
        request.onerror = () => {
          db.close();
          reject(request.error);
        };
        request.onsuccess = () => {
          db.close();
          resolve(request.result);
        };
      };
    });
  });
}
async function setup(page: Page) {
  await page.goto("/week/setup");
  await expect(
    page.getByRole("heading", { name: "Plan your week", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "3 days", exact: true }).click();
}
async function saveMilk(page: Page) {
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Allergies", exact: true });
  await dialog.getByLabel("Search for an allergy").fill("dairy");
  await dialog.getByRole("button", { name: /^Milk Includes/ }).click();
  await expect(
    dialog.getByRole("button", { name: "Remove Milk", exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Use allergies for this plan" })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByText("Allergies saved", { exact: true }),
  ).toBeVisible();
}
async function generate(page: Page) {
  await page.getByRole("button", { name: "Plan my week", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your week is ready", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /^Actions for / })).toHaveCount(
    3,
  );
}

test("live guest plans omit identified and uncertain milk matches and survive refresh", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  await saveMilk(page);
  await generate(page);
  const drafts = await storedDrafts(page);
  expect(drafts).toHaveLength(1);
  for (const choice of drafts[0]!.mealChoices) {
    const recipe = catalogue.meals.find(
      (meal: { id: string; version: number }) =>
        meal.id === choice.catalogueMealId &&
        meal.version === choice.catalogueVersion,
    );
    expect(
      recipe,
      `Missing generated recipe ${choice.catalogueMealId}`,
    ).toBeTruthy();
    expect(isAllergyEligible(recipe!, ["milk"])).toBe(true);
  }
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Your week is ready", exact: true }),
  ).toBeVisible();
  expect(await storedDrafts(page)).toEqual(drafts);
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("foodedo:guest-allergies:v1")!),
    ),
  ).toEqual(["milk"]);
});

test("live allergy saves warn about existing meals without changing the plan or shopping screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  await generate(page);
  const firstId = (await storedDrafts(page))[0]!.mealChoices[0]!
    .catalogueMealId;
  const milkMeal = catalogue.meals.find(
    (meal: { id: string; allergenIds?: string[] }) =>
      meal.id !== firstId && meal.allergenIds?.includes("milk"),
  );
  expect(milkMeal).toBeTruthy();
  await page
    .getByRole("button", { name: /^Actions for / })
    .first()
    .click();
  const picker = page.getByRole("dialog");
  await picker.getByRole("button", { name: /Choose a recipe Browse/ }).click();
  await picker
    .getByRole("button", { name: `Select ${milkMeal!.title}`, exact: true })
    .click();
  await picker
    .getByRole("button", { name: `Swap in ${milkMeal!.title}`, exact: true })
    .click();
  await expect(picker).not.toBeVisible();
  const before = await storedDrafts(page);
  await page.goto("/shop");
  await expect(page.getByRole("main")).toContainText("Shopping");
  const shoppingBefore = await page.getByRole("main").innerText();
  await page.goto("/week/setup");
  await expect(
    page.getByRole("button", { name: "Add", exact: true }),
  ).toBeEnabled();
  await saveMilk(page);
  expect(await storedDrafts(page)).toEqual(before);
  await page.goto("/week");
  await expect(
    page.getByText("Contains milk", { exact: true }).first(),
  ).toBeVisible();
  expect(await storedDrafts(page)).toEqual(before);
  await page.goto("/shop");
  await expect(page.getByRole("main")).toContainText("Shopping");
  await expect(page.getByRole("main")).toHaveText(shoppingBefore, {
    useInnerText: true,
  });
  await page.goto(`/recipes/${milkMeal!.slug}`);
  await expect(page.getByText("Contains milk", { exact: true })).toBeVisible();
  await expect(
    page.getByText("In your allergies — check ingredient").first(),
  ).toBeVisible();
  await expect(
    page
      .getByText(
        /Always check ingredients, product labels and cross-contact risks/,
      )
      .first(),
  ).toBeVisible();
  await page.screenshot({
    path: "/private/tmp/foodedo-allergy-live-recipe.png",
    fullPage: true,
  });
  await page.goto("/recipes");
  await page
    .getByRole("textbox", { name: "Search recipes", exact: true })
    .fill(milkMeal!.title);
  const card = page
    .getByRole("link")
    .filter({ hasText: milkMeal!.title })
    .filter({ hasText: "Contains milk" })
    .first();
  await expect(card).toBeVisible();
  await page.screenshot({ path: "/private/tmp/foodedo-allergy-live-list.png" });
});

test("live guest allergies save offline and stale panels cannot overwrite another tab", async ({
  page,
  context,
}) => {
  await setup(page);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Allergies", exact: true });
  await panel.getByRole("button", { name: "Eggs", exact: true }).click();
  await context.setOffline(true);
  await panel
    .getByRole("button", { name: "Use allergies for this plan" })
    .click();
  await expect(panel).not.toBeVisible();
  await expect(
    page.getByText("Allergies saved", { exact: true }),
  ).toBeVisible();
  await context.setOffline(false);
  await page.getByRole("button", { name: "Manage", exact: true }).click();
  await panel.getByRole("button", { name: "Peanuts", exact: true }).click();
  const other = await context.newPage();
  await other.goto("/week/setup");
  await other.getByRole("button", { name: "Manage", exact: true }).click();
  const otherPanel = other.getByRole("dialog", {
    name: "Allergies",
    exact: true,
  });
  await otherPanel.getByLabel("Search for an allergy").fill("garlic");
  await otherPanel.getByRole("button", { name: "Garlic", exact: true }).click();
  await otherPanel
    .getByRole("button", { name: "Use allergies for this plan" })
    .click();
  await expect(otherPanel).not.toBeVisible();
  await panel
    .getByRole("button", { name: "Use allergies for this plan" })
    .click();
  await expect(panel.getByRole("alert")).toContainText("changed elsewhere");
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("foodedo:guest-allergies:v1")!),
    ),
  ).toEqual(["eggs", "garlic"]);
  await other.close();
});

test("live multi-select, removal and unsupported searches preserve the exact saved choices", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Allergies", exact: true });
  const search = panel.getByLabel("Search for an allergy");
  await search.fill("Unknown product");
  await expect(
    panel.getByText("No match found", { exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByRole("button", { name: "Use allergies for this plan" }),
  ).toBeDisabled();
  await panel.getByRole("button", { name: "Edit search", exact: true }).click();
  await expect(search).toBeFocused();
  await expect(search).toHaveValue("Unknown product");
  await search.fill("nuts");
  await panel.getByRole("button", { name: "Peanuts", exact: true }).click();
  await expect(
    panel.getByRole("button", { name: "Remove Peanuts", exact: true }),
  ).toBeVisible();
  await panel.getByRole("button", { name: "Tree nuts", exact: true }).click();
  await expect(
    panel.getByRole("button", { name: "Remove Tree nuts", exact: true }),
  ).toBeVisible();
  await expect(search).toHaveValue("nuts");
  await search.fill("dairy");
  await panel.getByRole("button", { name: /^Milk Includes/ }).click();
  await expect(
    panel.getByRole("button", { name: "Remove Milk", exact: true }),
  ).toBeVisible();
  await panel
    .getByRole("button", { name: "Remove Peanuts", exact: true })
    .click();
  await expect(
    panel.getByRole("button", { name: "Remove Peanuts", exact: true }),
  ).toHaveCount(0);
  await expect(
    panel.getByRole("button", { name: "Remove Tree nuts", exact: true }),
  ).toBeVisible();
  await panel
    .getByRole("button", { name: "Back to plan settings", exact: true })
    .click();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("foodedo:guest-allergies:v1"),
    ),
  ).toBeNull();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(
    panel.getByRole("button", { name: "Remove Milk", exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByRole("button", { name: "Remove Tree nuts", exact: true }),
  ).toBeVisible();
  await panel
    .getByRole("button", { name: "Use allergies for this plan" })
    .click();
  await expect(panel).not.toBeVisible();
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("foodedo:guest-allergies:v1")!),
    ),
  ).toEqual(["milk", "tree-nuts"]);
});
