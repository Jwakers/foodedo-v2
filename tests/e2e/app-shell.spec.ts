import { expect, test } from "@playwright/test";

test("serves the dashboard with shared app chrome", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle("Foodedo");
  await expect(
    page.getByRole("heading", { name: "Dinner, decided." }),
  ).toBeVisible();
  await expect(page.locator("header")).toBeVisible();
  await expect(
    page.locator("header").getByRole("link", { name: "Foodedo" }),
  ).toBeVisible();
  await expect(
    page.locator("header").getByRole("button", { name: "Sign in" }),
  ).toBeVisible();
  const navigation = page.getByRole("navigation", { name: "Primary" });
  await expect(navigation).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Home" })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Week" })).toBeVisible();
  await expect(
    navigation.getByRole("link", { name: "Shopping" }),
  ).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Recipes" })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Home" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    "href",
    "/manifest.webmanifest",
  );
});

test("keeps obsolete feature routes as nominal placeholders", async ({
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
