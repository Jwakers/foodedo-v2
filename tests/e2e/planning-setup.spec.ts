import { expect, test, type Page } from "@playwright/test";

async function storedDrafts(page: Page) {
  return page.evaluate(async () => {
    const databases = await indexedDB.databases();
    if (!databases.some((database) => database.name === "foodedo")) return [];
    return new Promise<
      Array<{ planDays: number; servings: number; planStartDate: string }>
    >((resolve, reject) => {
      const open = indexedDB.open("foodedo");
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
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

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1280, height: 900 },
]) {
  test(`setup precedes generation and its action stays above navigation at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/?try=1");
    await expect(
      page.getByRole("heading", { name: "Dinner, decided." }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "3 days", exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Plan my week", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Plan your week", exact: true }),
    ).toBeVisible();
    expect(await storedDrafts(page)).toEqual([]);
    await page.getByRole("button", { name: "3 days", exact: true }).click();
    await page.getByRole("button", { name: "Decrease servings" }).click();
    await page.getByRole("button", { name: "Decrease servings" }).click();
    await page
      .getByRole("button", { name: "Choose date", exact: true })
      .click();
    await page.getByLabel("Choose plan start date").fill("2030-11-04");
    // Exercise a larger home-indicator inset and scroll in both directions.
    await page.addStyleTag({
      content: ":root { --app-nav-pad-bottom: 34px; }",
    });
    const generate = page.getByRole("button", {
      name: "Plan my week",
      exact: true,
    });
    for (const position of [10000, 0]) {
      await page.evaluate((top) => window.scrollTo(0, top), position);
      const button = await generate.boundingBox();
      const nav = await page
        .getByRole("navigation", { name: "Primary" })
        .boundingBox();
      expect(button).not.toBeNull();
      expect(nav).not.toBeNull();
      expect(button!.y).toBeGreaterThan(0);
      expect(button!.y + button!.height).toBeLessThanOrEqual(nav!.y);
    }
    expect(await storedDrafts(page)).toEqual([]);
    await generate.click();
    await expect(
      page.getByRole("heading", { name: "Your week is ready" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^Actions for / }),
    ).toHaveCount(3);
    await expect(
      page.getByRole("button", { name: "3 days", exact: true }),
    ).toHaveCount(0);
    const drafts = await storedDrafts(page);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({
      planDays: 3,
      servings: 2,
      planStartDate: "2030-11-04",
    });

    await page
      .getByRole("button", { name: "Try another week", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Try another week", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Plan my week", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Your week is ready" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^Actions for / }),
    ).toHaveCount(3);
    const regenerated = await storedDrafts(page);
    expect(regenerated).not.toEqual(drafts);
    expect(regenerated[0]).toMatchObject({
      planDays: 3,
      servings: 2,
      planStartDate: "2030-11-04",
    });
  });
}

test("the empty Week tab opens setup without generating", async ({ page }) => {
  await page.goto("/week");
  await expect(
    page.getByRole("heading", { name: "Plan your week", exact: true }),
  ).toBeVisible();
  expect(await storedDrafts(page)).toEqual([]);
  await page.getByRole("button", { name: "5 days", exact: true }).click();
  await page.getByRole("button", { name: "Plan my week", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Actions for / })).toHaveCount(
    5,
  );
});
