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
  await expect(
    page.getByText("7 days · starts tomorrow · serves 4"),
  ).toBeVisible();

  await page.getByRole("link", { name: "Plan my week" }).click();
  await expect(
    page.getByRole("heading", { name: "No week planned yet" }),
  ).toBeVisible();
  await expect(
    page.getByText("Seven useful dinners in one tap. Adjust anything after."),
  ).toBeVisible();

  await page.getByRole("button", { name: "Plan my week" }).click();
  await expect(
    page.getByRole("heading", { name: "Your week is ready" }),
  ).toBeVisible();
  await expect(
    page.getByText("Keep planning—sign in later to save this week."),
  ).toBeVisible();
  await expect(page.getByText("No meal planned")).toBeVisible();
  await expect(page.getByText("Leave it free or add a meal")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add meal" })).toBeVisible();
  await expect(page.getByText(/6 planned dinners/)).toBeVisible();
  await expect(page.getByRole("button", { name: /^Actions for / })).toHaveCount(
    6,
  );
  await expect(
    page.getByRole("button", { name: "Save my plan" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Try another week" }),
  ).toBeVisible();

  await expect(page.locator("header")).toBeVisible();
  const navigation = page.getByRole("navigation", { name: "Primary" });
  await expect(navigation).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Week" })).toHaveAttribute(
    "aria-current",
    "page",
  );

  await navigation.getByRole("link", { name: "Home" }).click();
  await expect(
    page.getByRole("heading", { name: "Dinner, decided." }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Adjust" })).toBeVisible();

  await page.getByRole("button", { name: "Adjust" }).click();
  await expect(
    page.getByRole("heading", { name: "Make Foodedo fit your week" }),
  ).toBeVisible();
  await expect(page.getByText("Dietary & planning preferences")).toBeVisible();
  await expect(
    page.getByText("Prefer recipes you like — remembered next time"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sign in to personalise" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close adjustments" }).click();

  await expect(
    page.getByRole("heading", { name: "Make Foodedo fit your week" }),
  ).toHaveCount(0);

  await navigation.getByRole("link", { name: "Recipes" }).click();
  await expect(page.getByRole("heading", { name: "Recipes" })).toBeVisible();

  await navigation.getByRole("link", { name: "Week" }).click();
  await expect(
    page.getByRole("heading", { name: "Your week is ready" }),
  ).toBeVisible();

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
