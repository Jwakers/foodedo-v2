import { expect, test } from "@playwright/test";

test("guest introductions stay dismissed across reloads and generation retires Home", async ({
  page,
}) => {
  await page.goto("/?try=1");
  const homeHint = page.getByRole("complementary", {
    name: "Planning introduction",
  });
  await expect(homeHint).toBeVisible();
  await page.getByRole("button", { name: "Plan my week", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Plan your week", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Plan my week", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your week is ready" }),
  ).toBeVisible({ timeout: 15000 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Dinner, decided." }),
  ).toBeVisible();
  await expect(homeHint).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Dinner, decided." }),
  ).toBeVisible();
  await expect(homeHint).toHaveCount(0);
  await page.goto("/recipes");
  const hint = page.getByRole("complementary", {
    name: "Saving recipes introduction",
  });
  await expect(hint).toBeVisible();
  await page
    .getByRole("button", { name: "Dismiss saving recipes introduction" })
    .click();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Recipes", exact: true }),
  ).toBeVisible();
  await expect(hint).toHaveCount(0);
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1280, height: 900 },
])
  test(`Help fits its content and preserves context at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/recipes");
    await page.getByRole("textbox", { name: "Search recipes" }).fill("chicken");
    const filter = page.getByRole("button", {
      name: "Under 30 min",
      exact: true,
    });
    await filter.click();
    await page.evaluate(() => window.scrollTo(0, 120));
    const before = await page.evaluate(() => ({
      url: location.href,
      scroll: scrollY,
    }));
    await page.getByRole("button", { name: "Help", exact: true }).click();
    const help = page.getByRole("dialog", { name: "How Foodedo works" });
    await expect(help).toBeVisible();
    await expect
      .poll(async () => {
        const bounds = await help.boundingBox();
        return (
          bounds !== null &&
          bounds.y > 0 &&
          bounds.height <= Math.min(viewport.height * 0.85, 672) + 1 &&
          bounds.y + bounds.height <= viewport.height + 1
        );
      })
      .toBe(true);
    const guide = help.getByRole("region", { name: "Foodedo guide" });
    await expect(guide.getByRole("link", { name: "Contact us" })).toHaveCount(
      1,
    );
    const headingStyles = await guide.locator("h2").evaluateAll((headings) =>
      headings.map((heading) => {
        const style = getComputedStyle(heading);
        return `${style.fontFamily}|${style.fontSize}|${style.fontWeight}`;
      }),
    );
    expect(new Set(headingStyles).size).toBe(1);
    const bottomGap = await guide.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
      const last = element.lastElementChild!;
      return (
        element.getBoundingClientRect().bottom -
        last.getBoundingClientRect().bottom
      );
    });
    expect(bottomGap).toBeGreaterThanOrEqual(23);
    expect(bottomGap).toBeLessThanOrEqual(25);
    await expect(
      help.getByText(/keep catalogue recipes in Saved/),
    ).toBeVisible();
    await help
      .getByRole("button", { name: "Back to what I was doing" })
      .click();
    await expect(help).not.toBeVisible();
    await expect(
      page.getByRole("button", { name: "Help", exact: true }),
    ).toBeFocused();
    await expect(
      page.getByRole("textbox", { name: "Search recipes" }),
    ).toHaveValue("chicken");
    await expect(filter).toHaveAttribute("aria-pressed", "true");
    expect(
      await page.evaluate(() => ({ url: location.href, scroll: scrollY })),
    ).toEqual(before);
    await page.getByRole("button", { name: "Help", exact: true }).click();
    await page.keyboard.press("Escape");
    await expect(help).not.toBeVisible();
  });
