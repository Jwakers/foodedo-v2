import { expect, test } from "@playwright/test";

test("shows welcome on signed-out cold open without app chrome", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page).toHaveTitle("Foodedo");
  await expect(
    page.getByRole("heading", { name: "Make food decisions easier." }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Try Foodedo" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sign in or create account" }),
  ).toBeVisible();
  await expect(
    page.getByText("Try Foodedo now. Save everything later."),
  ).toBeVisible();

  await expect(page.locator("header")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Primary" })).toHaveCount(
    0,
  );
});

test("enters the guest app from welcome and keeps skip across navigation", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Try Foodedo" }).click();

  await expect(
    page.getByRole("heading", { name: "Dinner, decided." }),
  ).toBeVisible();
  await expect(page.locator("header")).toBeVisible();
  const navigation = page.getByRole("navigation", { name: "Primary" });
  await expect(navigation).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Home" })).toHaveAttribute(
    "aria-current",
    "page",
  );

  await navigation.getByRole("link", { name: "Recipes" }).click();
  await expect(page.getByRole("heading", { name: "Recipes" })).toBeVisible();

  await navigation.getByRole("link", { name: "Home" }).click();
  await expect(
    page.getByRole("heading", { name: "Dinner, decided." }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Make food decisions easier." }),
  ).toHaveCount(0);
});

test("keeps the guest session across refresh on web", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Try Foodedo" }).click();
  await expect(
    page.getByRole("heading", { name: "Dinner, decided." }),
  ).toBeVisible();

  await page.reload();

  await expect(
    page.getByRole("heading", { name: "Dinner, decided." }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Make food decisions easier." }),
  ).toHaveCount(0);
});

test("does not intercept public recipe deep links with welcome", async ({
  page,
}) => {
  await page.goto("/recipes");
  await expect(page.getByRole("heading", { name: "Recipes" })).toBeVisible();
  await expect(page.getByText(/intentionally clear/)).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Primary" }).getByRole("link", {
      name: "Recipes",
    }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByRole("heading", { name: "Make food decisions easier." }),
  ).toHaveCount(0);
});

test("exposes valid home-screen metadata and icons", async ({ request }) => {
  const response = await request.get("/manifest.webmanifest");
  expect(response.ok()).toBeTruthy();

  const manifest = (await response.json()) as {
    name?: string;
    start_url?: string;
    display?: string;
    icons?: Array<{ src: string; sizes: string; type: string }>;
  };

  expect(manifest).toMatchObject({
    name: "Foodedo",
    start_url: "/",
    display: "standalone",
  });
  expect(manifest.icons).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ sizes: "192x192", type: "image/png" }),
      expect.objectContaining({ sizes: "512x512", type: "image/png" }),
    ]),
  );

  for (const icon of manifest.icons ?? []) {
    const iconResponse = await request.get(icon.src);
    expect(iconResponse.ok()).toBeTruthy();
    expect(iconResponse.headers()["content-type"]).toContain("image/png");
  }
});
