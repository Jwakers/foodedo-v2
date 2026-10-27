import { expect, test } from "@playwright/test";

test("changing web sort preserves draft filters and applies both from page one", async ({
  page,
}) => {
  await page.goto("/recipes?page=2");
  await page.getByRole("button", { name: "Filter", exact: true }).click();
  const fish = page.getByRole("button", { name: "Fish", exact: true });
  await fish.click();
  await expect(fish).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: /Sort by/ }).click();
  await page.getByRole("radio", { name: /Quickest first/ }).click();
  await expect(fish).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Show recipes", exact: true }).click();
  await expect(page).toHaveURL(/\/recipes\?sort=quickest&protein=fish$/);
  await expect(page.locator("main ul > li").first()).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Filter", exact: true }).click();
  await expect(fish).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: /Sort by Quickest first/ }),
  ).toBeVisible();
});
