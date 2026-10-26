import { expect, test } from "@playwright/test";

test.use({
  viewport: { width: 414, height: 896 },
  isMobile: true,
  hasTouch: true,
});

test("can leave the recipe planner by closing or swiping without choosing a day", async ({
  page,
  context,
}) => {
  await page.goto("/recipes/view?slug=baked-chicken-and-rice-casserole");
  const planMeal = page.getByRole("button", {
    name: "Plan this meal",
    exact: true,
  });
  // With no existing plan this first action creates a local guest week.
  await planMeal.click();
  await expect(page).toHaveURL(/\/week$/);
  await page.goBack();
  await planMeal.click();

  const planner = page.getByRole("dialog", {
    name: "Plan this meal",
    exact: true,
  });
  await expect(planner).toBeVisible();
  const originalDays = await planner.locator("li button").allTextContents();
  const recipeUrl = page.url();
  await planner.getByRole("button", { name: "Close", exact: true }).tap();
  await expect(planner).toBeHidden();
  await expect(page).toHaveURL(recipeUrl);

  await planMeal.tap();
  await expect(planner).toBeVisible();
  await expect(planner.locator("li button")).toHaveText(originalDays);
  // A real touch sequence outside the small handle exercises header dragging.
  // Chromium mobile emulation is a regression check, not a physical iOS test.
  const heading = planner.getByRole("heading", { name: "Plan this meal" });
  await expect(planner).toHaveCSS(
    "transform",
    /^(none|matrix\(1, 0, 0, 1, 0, 0\))$/,
  );
  const bounds = await heading.boundingBox();
  if (!bounds) throw new Error("Planner heading is unavailable");
  const session = await context.newCDPSession(page);
  const x = bounds.x + bounds.width / 2;
  const y = bounds.y + bounds.height / 2;
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y }],
  });
  for (let step = 1; step <= 10; step++) {
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x, y: y + step * 25 }],
    });
  }
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await session.detach();
  await expect(planner).toBeHidden();
  await expect(page).toHaveURL(recipeUrl);
  await planMeal.tap();
  await expect(planner.locator("li button")).toHaveText(originalDays);
});
