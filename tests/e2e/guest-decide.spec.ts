import { expect, test } from "@playwright/test";

test("keeps a seven-day guest meal plan across reloads", async ({ page }) => {
  await page.goto("/");

  const decide = page.locator('section[aria-labelledby="decide-heading"]');
  await expect(
    decide.getByRole("heading", { name: "Your week, decided." }),
  ).toBeVisible();

  const planRows = decide.getByRole("listitem");
  await expect(planRows).toHaveCount(7);
  await expect(planRows.nth(0)).toContainText("Today");
  await expect(planRows.nth(1)).toContainText("Tomorrow");

  const firstMeal = planRows.nth(0).getByRole("heading", { level: 3 });
  const originalMeal = await firstMeal.textContent();
  await planRows.nth(0).getByRole("button", { name: "Swap" }).click();
  await expect
    .poll(async () => await firstMeal.textContent())
    .not.toBe(originalMeal);
  const swappedMeal = await firstMeal.textContent();

  await page.reload();
  await expect(decide.getByRole("listitem")).toHaveCount(7);
  await expect(
    decide.getByRole("listitem").nth(0).getByRole("heading", { level: 3 }),
  ).toHaveText(swappedMeal ?? "");

  await decide.getByRole("button", { name: "Shuffle plan" }).click();
  await expect(
    decide.getByRole("button", { name: "Shuffle plan" }),
  ).toBeEnabled();
  await expect(decide.getByRole("listitem")).toHaveCount(7);
});
