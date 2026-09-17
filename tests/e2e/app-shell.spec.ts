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
  test.setTimeout(60_000);
  await page.goto("/");
  await page.getByRole("button", { name: "Try Foodedo" }).click();

  await expect(
    page.getByRole("heading", { name: "Dinner, decided." }),
  ).toBeVisible();
  await expect(
    page.getByText("7 days · starts tomorrow · serves 4"),
  ).toBeVisible();

  await page.getByRole("button", { name: "Plan my week" }).click();
  await expect(
    page.getByRole("heading", { name: "Your week is ready" }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    page.getByText(
      "Keep planning. Sign in when you're ready to save this week.",
    ),
  ).toBeVisible();
  await expect(page.getByText(/7 planned dinners/)).toBeVisible();
  await expect(page.getByRole("button", { name: /^Actions for / })).toHaveCount(
    7,
  );
  await expect(
    page.getByRole("button", { name: "Save my plan" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Try another week" }),
  ).toBeVisible();
  // Guest review hides the dock — focused temporary state, not a destination.
  await expect(page.getByRole("navigation", { name: "Primary" })).toHaveCount(
    0,
  );

  await page.getByRole("button", { name: "Save my plan" }).click();
  await expect(
    page.getByRole("heading", { name: "Save this week" }),
  ).toBeVisible();
  await expect(page.getByText("Keep this exact week")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sign in to save" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Not now" }).click();
  await expect(
    page.getByRole("heading", { name: "Your week is ready" }),
  ).toBeVisible();
  await expect(page.getByText("Keep this exact week")).toHaveCount(0);

  const firstMealActions = page
    .getByRole("button", { name: /^Actions for / })
    .first();
  const firstMealName =
    (await firstMealActions.getAttribute("aria-label"))?.replace(
      /^Actions for /,
      "",
    ) ?? "";
  await firstMealActions.click();
  await expect(
    page.getByRole("heading", { name: firstMealName }),
  ).toBeVisible();
  await expect(page.getByText("What would you like to do?")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Choose a recipe/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Choose for me/ }),
  ).toBeVisible();

  await page.getByRole("button", { name: /Choose a recipe/ }).click();
  await expect(
    page.getByRole("heading", { name: /Swap .+’s meal/ }),
  ).toBeVisible();
  await expect(
    page.getByText("Choose a better fit for your week"),
  ).toBeVisible();
  await expect(page.getByText("Good matches")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Choose a recipe" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Back" })).toBeVisible();

  await page.getByRole("button", { name: "Open filters" }).click();
  await expect(
    page.getByRole("heading", { name: "Filter recipes" }),
  ).toBeVisible();
  await expect(
    page.getByText("Only choose what would make this meal a better fit."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Close recipe filters" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(
    page.getByRole("heading", { name: /Swap .+’s meal/ }),
  ).toBeVisible();

  const previewCandidate = page.getByRole("button", {
    name: "View Baked Chicken and Rice Casserole",
  });
  await previewCandidate.click();
  await expect(
    page.getByRole("heading", { name: "Recipe details" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Baked Chicken and Rice Casserole" }),
  ).toBeVisible();
  await expect(page.getByText("Foodedo recipe").first()).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Ingredients" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(
    page.getByRole("heading", { name: /Swap .+’s meal/ }),
  ).toBeVisible();

  await page
    .getByRole("button", { name: "Select Baked Chicken and Rice Casserole" })
    .click();
  const swapButton = page.getByRole("button", {
    name: "Swap in Baked Chicken and Rice Casserole",
  });
  await swapButton.click();
  await expect(page.getByRole("button", { name: /^Swap in / })).toHaveCount(0);
  await expect(
    page
      .getByRole("button", {
        name: "Actions for Baked Chicken and Rice Casserole",
      })
      .first(),
  ).toBeVisible();

  await page
    .getByRole("button", { name: /^Actions for / })
    .first()
    .click();
  await expect(
    page.getByRole("button", { name: "Remove from plan" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Remove from plan" }).click();
  await expect(page.getByText("No meal planned")).toHaveCount(1);
  await expect(page.getByText(/6 planned dinners/)).toBeVisible();
  await expect(page.getByRole("button", { name: /^Actions for / })).toHaveCount(
    6,
  );

  await expect(page.locator("header")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary" })).toHaveCount(
    0,
  );

  await page.goto("/");
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

  const navigation = page.getByRole("navigation", { name: "Primary" });
  await navigation.getByRole("link", { name: "Recipes" }).click();
  await expect(page.getByRole("heading", { name: "Recipes" })).toBeVisible();

  await navigation.getByRole("link", { name: "Week" }).click();
  await expect(
    page.getByRole("heading", { name: "Your week is ready" }),
  ).toBeVisible();

  await page.goto("/");
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
  await expect(
    page.getByText("Saved favourites, your recipes and new ideas."),
  ).toBeVisible();
  await expect(page.getByRole("group", { name: "Recipe scopes" })).toHaveCount(
    0,
  );
  await expect(page.getByText("Ideas for you")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save Chicken Fajitas" }),
  ).toBeVisible();
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

test("opens a catalogue recipe detail page with shared content chrome", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Try Foodedo" }).click();
  await page.getByRole("link", { name: /Lemon Herb Grilled Chicken/i }).click();

  await expect(
    page.getByRole("heading", { name: "Lemon Herb Grilled Chicken" }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Back" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Foodedo" })).toBeVisible();
  await expect(page.getByText("Foodedo recipe")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Ingredients" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Method" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Start cooking" }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Plan this meal" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Recipe options" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save Lemon Herb Grilled Chicken" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Recipe options" }).click();
  await expect(page.getByRole("button", { name: "Share" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Report/i })).toHaveCount(0);

  await page.getByRole("button", { name: /Serves / }).click();
  await expect(
    page.getByText("Ingredient quantities update automatically"),
  ).toBeVisible();
});

test("runs and recovers the guest Cook Mode flow", async ({ page }) => {
  await page.goto("/recipes/baked-chicken-and-rice-casserole");
  await page.getByRole("button", { name: /Serves 4/ }).click();
  await page.getByRole("button", { name: "Increase servings" }).click();
  await expect(page.getByRole("button", { name: /Serves 5/ })).toBeVisible();
  await expect(page.getByText("500 g")).toBeVisible();

  await page.getByRole("button", { name: "Start cooking" }).first().click();
  await expect(page).toHaveURL(/\/cook\?servings=5$/);
  await expect(
    page.getByRole("heading", { name: "Get everything ready" }),
  ).toBeVisible();
  await expect(page.getByText("Preheat oven to 180°C")).toBeVisible();
  await expect(page.getByText("Scaled for 5")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Primary" })).toHaveCount(
    0,
  );

  const firstPreparation = page.getByRole("button", {
    name: /Mark chicken breast prepared/,
  });
  await firstPreparation.click();
  await expect(firstPreparation).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "I’m ready — start cooking" }).click();
  await expect(page.getByText("Step 1 of 3")).toBeVisible();
  await page.getByRole("button", { name: "Previous" }).click();
  await expect(
    page.getByRole("heading", { name: "Get everything ready" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "I’m ready — start cooking" }).click();
  await page.getByRole("button", { name: "Next step" }).click();
  await page.getByRole("button", { name: "Next step" }).click();
  await page.getByRole("button", { name: "Start 45 min timer" }).click();
  await expect(page.getByText(/Casserole · (45 min|44:59)/)).toBeVisible();

  await page.getByRole("button", { name: "Show ingredients" }).click();
  await expect(
    page.getByRole("heading", { name: "Ingredients" }),
  ).toBeVisible();
  await expect(page.getByText("Scaled for 5")).toBeVisible();
  await expect(page.getByText("500 g")).toBeVisible();
  await expect(page.getByText(/Casserole ·/)).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Ingredients" }),
  ).toBeVisible();
  await expect(page.getByText(/Casserole ·/)).toBeVisible();
  await page.getByRole("button", { name: "Back to cooking" }).click();
  await expect(page.getByText("Step 3 of 3")).toBeVisible();

  await page
    .getByRole("button", { name: "Timer options for Casserole" })
    .click();
  await expect(page.getByRole("menu", { name: /Timer options/ })).toBeVisible();
  await page.getByRole("menuitem", { name: "Restart timer" }).click();
  await expect(page.getByText(/Casserole · (45 min|44:59)/)).toBeVisible();

  await page.getByRole("button", { name: "Dinner’s ready" }).click();
  await expect(page.getByText("Time to serve.")).toBeVisible();
  await page.getByRole("button", { name: "Back to recipe" }).click();
  await page.getByRole("button", { name: "Start cooking" }).first().click();
  await expect(
    page.getByRole("heading", { name: "Get everything ready" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Mark chicken breast prepared/ }),
  ).toHaveAttribute("aria-pressed", "false");
});

test("only shows Cook preheat when the recipe explicitly authors it", async ({
  page,
}) => {
  await page.goto("/recipes/lemon-herb-grilled-chicken/cook");
  await expect(
    page.getByRole("heading", { name: "Get everything ready" }),
  ).toBeVisible();
  await expect(page.getByText(/Preheat oven to/)).toHaveCount(0);
});
