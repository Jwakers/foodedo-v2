import { expect, test } from "@playwright/test";

test("serves the Foodedo app shell", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle("Foodedo");
  await expect(page.getByRole("heading", { name: "Foodedo" })).toBeVisible();
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    "href",
    "/manifest.webmanifest",
  );
  await expect(
    page
      .getByRole("button", { name: "Sign in", exact: true })
      .or(page.getByText("Account unavailable", { exact: true })),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "A few good answers to “what shall we eat?”",
    }),
  ).toBeVisible();
  await expect(
    page
      .locator('section[aria-labelledby="catalogue-heading"]')
      .getByRole("heading", { name: "Tomato and lentil pasta" }),
  ).toBeVisible();
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
