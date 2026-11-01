import { expect, test } from "../helpers/fixture-test";
import {
  buildBrowserFixture,
  productionStylesheet,
} from "../helpers/browser-fixture";
import path from "node:path";

const title = "Sausage, Tomato and Spinach Gnocchi Bake";
const recipePath = "/recipes/sausage-tomato-and-spinach-gnocchi-bake";
let javascript = "";
let stylesheet = "";
test.beforeAll(async () => {
  stylesheet = productionStylesheet();
  const fixture = path.resolve("tests/browser-fixtures/recipe-hydration");
  javascript = await buildBrowserFixture({
    define: {
      "process.env.NODE_ENV": JSON.stringify("production"),
      "process.env.NEXT_PUBLIC_POSTHOG_KEY": JSON.stringify(""),
      "process.env.NEXT_PUBLIC_CAPACITOR_BUILD": JSON.stringify("false"),
      "process.env.SITE_URL": JSON.stringify("https://www.foodedo.com"),
      "process.env.NEXT_PUBLIC_SITE_URL": JSON.stringify(
        "https://www.foodedo.com",
      ),
    },
    resolve: {
      alias: {
        "@": path.resolve("src"),
        "@clerk/react": path.join(fixture, "clerk.tsx"),
        "convex/react": path.join(fixture, "convex.ts"),
        "next/navigation": path.resolve(
          "tests/browser-fixtures/household/navigation.ts",
        ),
        "next/link": path.resolve(
          "tests/browser-fixtures/catalogue-admin/link.tsx",
        ),
        "next/image": path.resolve(
          "tests/browser-fixtures/catalogue-admin/next.tsx",
        ),
      },
    },
    entry: path.join(fixture, "entry.tsx"),
    name: "RecipeHydrationFixture",
  });
});
test.beforeEach(async ({ page }) => {
  await page.route("https://recipe-hydration.fixture/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/app.js")
      await route.fulfill({
        contentType: "application/javascript",
        body: javascript,
      });
    else if (url.pathname === "/app.css")
      await route.fulfill({ contentType: "text/css", body: stylesheet });
    else if (url.pathname.startsWith("/images/"))
      await route.fulfill({
        path: path.resolve("public", url.pathname.slice(1)),
      });
    else
      await route.fulfill({
        contentType: "text/html",
        body: '<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>',
      });
  });
});

test("private recipe account hydration keeps the skeleton until the matching account arrives", async ({
  page,
}) => {
  await page.goto(
    "https://recipe-hydration.fixture/recipes/view?recipeId=private-recipe&servings=2&planServings=2",
  );
  await page.evaluate(() => {
    window.recipeHydrationFixture.update({
      isLoaded: true,
      isSignedIn: true,
      userId: "user-a",
      isAuthenticated: true,
      isLoading: false,
    });
  });
  const loading = page.getByRole("main", { name: "Loading recipe" });
  await expect(loading).toBeVisible();
  await expect(page.getByText("Preparing your Foodedo account")).toHaveCount(0);
  await expect(page.locator("main[data-recipe-instance]")).toHaveCount(0);
  await page.evaluate(() =>
    window.recipeHydrationFixture.update({
      account: { authSubject: "previous-user" },
    }),
  );
  await expect(loading).toBeVisible();
  await expect(page.getByText("Preparing your Foodedo account")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => window.recipeHydrationFixture.counts.personalQueries,
    ),
  ).toEqual([]);
  expect(
    await page.evaluate(() => window.recipeHydrationFixture.counts.mutations),
  ).toEqual([]);
  await page.evaluate(() =>
    window.recipeHydrationFixture.update({
      account: { authSubject: "user-a" },
      household: null,
      personalReady: true,
    }),
  );
  await expect(loading).toHaveCount(0);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
});

test.describe("private recipe layout continuity", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("header, content origin and navigation survive each hydration frame", async ({
    page,
  }) => {
    await page.goto(
      "https://recipe-hydration.fixture/recipes/view?recipeId=private-recipe&servings=2&planServings=2",
    );
    await expect(
      page.getByRole("main", { name: "Loading recipe" }),
    ).toBeVisible();
    const header = await page.locator("header").elementHandle();
    const stages = [
      {},
      { isLoaded: true, isSignedIn: true, userId: "user-a" },
      { isAuthenticated: true, isLoading: false },
      { account: { authSubject: "previous-user" } },
      { account: { authSubject: "user-a" } },
      { personalReady: true },
    ];
    const samples = [];
    for (const stage of stages) {
      await page.evaluate(
        (next) => window.recipeHydrationFixture.update(next),
        stage,
      );
      samples.push(
        ...(await page.evaluate(async () => {
          const frames = [];
          for (let i = 0; i < 8; i++) {
            await new Promise(requestAnimationFrame);
            const header = document.querySelector("header");
            const nav = document.querySelector('nav[aria-label="Primary"]');
            frames.push({
              headerHeight: header?.getBoundingClientRect().height ?? 0,
              contentTop:
                header?.nextElementSibling?.getBoundingClientRect().top ?? 0,
              navigationTop: nav?.getBoundingClientRect().top ?? 0,
            });
          }
          return frames;
        })),
      );
    }
    expect(samples.every((frame) => frame.headerHeight === 54)).toBe(true);
    expect(samples.every((frame) => frame.contentTop === 54)).toBe(true);
    expect(new Set(samples.map((frame) => frame.navigationTop)).size).toBe(1);
    expect(await header!.evaluate((node) => node.isConnected)).toBe(true);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await page.getByRole("button", { name: "Cook for 2", exact: true }).click();
    await page.getByRole("button", { name: "Increase servings" }).click();
    await page.getByRole("button", { name: "Cook for 3", exact: true }).click();
    await page.evaluate(() =>
      window.recipeHydrationFixture.update({
        household: { _id: "household-a" },
      }),
    );
    await expect(
      page.getByRole("button", { name: "Cook for 3", exact: true }),
    ).toBeVisible();
    expect(await header!.evaluate((node) => node.isConnected)).toBe(true);
    await page.evaluate(() =>
      window.recipeHydrationFixture.update({ userId: "user-b" }),
    );
    await expect(
      page.getByRole("main", { name: "Loading recipe" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: title })).toHaveCount(0);
    expect(await header!.evaluate((node) => node.isConnected)).toBe(true);
    await page.evaluate(() =>
      window.recipeHydrationFixture.update({
        account: { authSubject: "user-b" },
      }),
    );
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Cook for 2", exact: true }),
    ).toBeVisible();
    await page.evaluate(() =>
      window.recipeHydrationFixture.update({
        isAuthenticated: false,
        isLoading: false,
      }),
    );
    await expect(
      page.getByRole("heading", {
        name: "We couldn’t load your Foodedo account",
      }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: title })).toHaveCount(0);
    expect(await header!.evaluate((node) => node.isConnected)).toBe(true);
    await page.evaluate(() =>
      window.recipeHydrationFixture.update({
        isSignedIn: false,
        userId: null,
        isAuthenticated: false,
        account: undefined,
      }),
    );
    await expect(
      page.getByRole("heading", { name: "Sign in to open this recipe" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: title })).toHaveCount(0);
    expect(await header!.evaluate((node) => node.isConnected)).toBe(true);
    expect(
      await page
        .locator("header")
        .evaluate((node) => node.getBoundingClientRect().height),
    ).toBe(54);
  });
});

test("private recipe account hydration still offers delayed and missing-account recovery", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto(
    "https://recipe-hydration.fixture/recipes/view?recipeId=private-recipe",
  );
  await page.evaluate(() =>
    window.recipeHydrationFixture.update({
      isLoaded: true,
      isSignedIn: true,
      userId: "user-a",
      isAuthenticated: true,
      isLoading: false,
    }),
  );
  await expect(
    page.getByRole("main", { name: "Loading recipe" }),
  ).toBeVisible();
  await page.clock.fastForward(10_001);
  await expect(
    page.getByRole("heading", {
      name: "Your account is taking a little longer",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sign out and continue as guest" }),
  ).toBeVisible();
  await page.reload();
  await page.evaluate(() =>
    window.recipeHydrationFixture.update({
      isLoaded: true,
      isSignedIn: true,
      userId: "user-a",
      isAuthenticated: true,
      isLoading: false,
      account: null,
      recovery: "pending",
    }),
  );
  await expect(
    page.getByRole("heading", { name: "Preparing your Foodedo account" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => window.recipeHydrationFixture.counts.mutations),
  ).toEqual(["users:ensureCurrent"]);
});

test("recipe and reading choices survive every sign-in stage, account switch and sign-out", async ({
  page,
}) => {
  await page.goto(`https://recipe-hydration.fixture${recipePath}`);
  const recipe = page.locator("main[data-recipe-instance]");
  const instance = await recipe.getAttribute("data-recipe-instance");
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save recipe", exact: true }),
  ).toBeVisible();
  await page.evaluate(() =>
    window.recipeHydrationFixture.update({ publicReady: true }),
  );
  await page.getByRole("button", { name: "Serves 4", exact: true }).click();
  await page.getByRole("button", { name: "Increase servings" }).click();
  await page.getByText("Recipe notes (1)", { exact: true }).click();
  const notes = page.locator("summary");
  await notes.focus();
  const readingPosition = await page.evaluate(() => scrollY);
  const stages = [
    { isLoaded: true, isSignedIn: true, userId: "user-a", isLoading: true },
    { isAuthenticated: true, isLoading: false },
    { account: { authSubject: "stale-user" } },
  ];
  for (const stage of stages) {
    await page.evaluate(
      (next) => window.recipeHydrationFixture.update(next),
      stage,
    );
    await expect(recipe).toHaveAttribute("data-recipe-instance", instance!);
    await expect(notes).toBeFocused();
    expect(await page.evaluate(() => scrollY)).toBe(readingPosition);
    await expect(
      page.getByRole("button", { name: "Serves 5", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Let the bake stand before serving."),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: `Save ${title}`, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Preparing your Foodedo account" }),
    ).toHaveCount(0);
    expect(
      await page.evaluate(
        () => window.recipeHydrationFixture.counts.personalQueries,
      ),
    ).toEqual([]);
    expect(
      await page.evaluate(() => window.recipeHydrationFixture.counts.mutations),
    ).toEqual([]);
  }
  await page.evaluate(() =>
    window.recipeHydrationFixture.update({
      account: { authSubject: "user-a" },
      household: null,
    }),
  );
  const favourite = page.getByRole("button", {
    name: `Save ${title}`,
    exact: true,
  });
  await expect(favourite).toBeEnabled();
  await favourite.click();
  await expect(
    page.getByRole("button", { name: `Unsave ${title}`, exact: true }),
  ).toBeVisible();
  await page.evaluate(() =>
    window.recipeHydrationFixture.update({
      household: { _id: "our-household" },
    }),
  );
  await expect(recipe).toHaveAttribute("data-recipe-instance", instance!);
  await expect(
    page.getByRole("button", { name: "Serves 5", exact: true }),
  ).toBeVisible();
  const queries = await page.evaluate(
    () => window.recipeHydrationFixture.counts.personalQueries.length,
  );
  await page.evaluate(() =>
    window.recipeHydrationFixture.update({ userId: "user-b", saved: [] }),
  );
  await expect(
    page.getByRole("button", { name: `Save ${title}`, exact: true }),
  ).toBeDisabled();
  expect(
    await page.evaluate(
      () => window.recipeHydrationFixture.counts.personalQueries.length,
    ),
  ).toBe(queries);
  await page.evaluate(() =>
    window.recipeHydrationFixture.update({
      account: { authSubject: "user-b" },
      household: null,
    }),
  );
  await expect(
    page.getByRole("button", { name: `Save ${title}`, exact: true }),
  ).toBeEnabled();
  await page.evaluate(() =>
    window.recipeHydrationFixture.update({
      isSignedIn: false,
      userId: null,
      isAuthenticated: false,
      isLoading: false,
    }),
  );
  await expect(recipe).toHaveAttribute("data-recipe-instance", instance!);
  await expect(
    page.getByRole("button", { name: "Serves 5", exact: true }),
  ).toBeVisible();
  await favourite.click();
  await expect(page.getByRole("dialog", { name: "Sign in" })).toBeVisible();
  await page.getByRole("button", { name: "Not now" }).click();
  await expect(recipe).toHaveAttribute("data-recipe-instance", instance!);
});

test("signed-out favourite opens sign-in and resumes one save after matching account hydration", async ({
  page,
}) => {
  await page.goto(`https://recipe-hydration.fixture${recipePath}`);
  await page.evaluate(() =>
    window.recipeHydrationFixture.update({
      isLoaded: true,
      isSignedIn: false,
      publicReady: true,
      isLoading: false,
    }),
  );
  const recipe = page.locator("main[data-recipe-instance]");
  const instance = await recipe.getAttribute("data-recipe-instance");
  await page
    .getByRole("button", { name: `Save ${title}`, exact: true })
    .click();
  await expect(page.getByRole("dialog", { name: "Sign in" })).toBeVisible();
  expect(
    await page.evaluate(() => window.recipeHydrationFixture.counts.mutations),
  ).toEqual([]);
  await page.evaluate(() =>
    window.recipeHydrationFixture.update({
      modalOpen: false,
      isSignedIn: true,
      userId: "user-a",
      isAuthenticated: true,
    }),
  );
  expect(
    await page.evaluate(() => window.recipeHydrationFixture.counts.mutations),
  ).toEqual([]);
  await page.evaluate(() =>
    window.recipeHydrationFixture.update({
      account: { authSubject: "user-a" },
      household: null,
    }),
  );
  await expect(
    page.getByRole("button", { name: `Unsave ${title}`, exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => window.recipeHydrationFixture.counts.mutations),
  ).toEqual(["recipes:setCatalogueMealSaved"]);
  await expect(recipe).toHaveAttribute("data-recipe-instance", instance!);
});

for (const failure of ["fail", "deleted"] as const) {
  test(`account recovery ${failure} keeps the public recipe and signs out in place`, async ({
    page,
  }) => {
    await page.goto(`https://recipe-hydration.fixture${recipePath}`);
    const recipe = page.locator("main[data-recipe-instance]");
    const instance = await recipe.getAttribute("data-recipe-instance");
    await page.evaluate(
      (recovery) =>
        window.recipeHydrationFixture.update({
          isLoaded: true,
          isSignedIn: true,
          userId: "user-a",
          isAuthenticated: true,
          isLoading: false,
          account: null,
          recovery,
          publicReady: true,
        }),
      failure,
    );
    await expect(
      page.getByRole("complementary", { name: "Account connection" }),
    ).toBeVisible();
    await expect(recipe).toHaveAttribute("data-recipe-instance", instance!);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    expect(
      await page.evaluate(
        () => window.recipeHydrationFixture.counts.personalQueries,
      ),
    ).toEqual([]);
    expect(
      await page.evaluate(() => window.recipeHydrationFixture.counts.mutations),
    ).toEqual(["users:ensureCurrent"]);
    await page
      .getByRole("button", { name: "Sign out and continue as guest" })
      .click();
    await expect(
      page.getByRole("complementary", { name: "Account connection" }),
    ).toHaveCount(0);
    await expect(page).toHaveURL(
      `https://recipe-hydration.fixture${recipePath}`,
    );
    await expect(recipe).toHaveAttribute("data-recipe-instance", instance!);
    await expect(
      page.getByRole("button", { name: `Save ${title}`, exact: true }),
    ).toBeEnabled();
  });
}

test("slow account hydration shows a notice without hiding or remounting the recipe", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto(`https://recipe-hydration.fixture${recipePath}`);
  const recipe = page.locator("main[data-recipe-instance]");
  const instance = await recipe.getAttribute("data-recipe-instance");
  await page.evaluate(() =>
    window.recipeHydrationFixture.update({
      isLoaded: true,
      isSignedIn: true,
      userId: "user-a",
      isAuthenticated: true,
      isLoading: false,
      publicReady: true,
    }),
  );
  await page.clock.fastForward(10_001);
  await expect(
    page.getByRole("complementary", { name: "Account connection" }),
  ).toBeVisible();
  await expect(recipe).toHaveAttribute("data-recipe-instance", instance!);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  expect(
    await page.evaluate(
      () => window.recipeHydrationFixture.counts.personalQueries,
    ),
  ).toEqual([]);
  await page.evaluate(() =>
    window.recipeHydrationFixture.update({
      account: { authSubject: "user-a" },
      household: null,
    }),
  );
  await expect(
    page.getByRole("complementary", { name: "Account connection" }),
  ).toHaveCount(0);
  await expect(recipe).toHaveAttribute("data-recipe-instance", instance!);
});

test("missing-account retry completes in place without resetting recipe choices", async ({
  page,
}) => {
  await page.goto(`https://recipe-hydration.fixture${recipePath}`);
  await page.evaluate(() =>
    window.recipeHydrationFixture.update({ publicReady: true }),
  );
  const recipe = page.locator("main[data-recipe-instance]");
  const instance = await recipe.getAttribute("data-recipe-instance");
  await page.getByRole("button", { name: "Serves 4", exact: true }).click();
  await page.getByRole("button", { name: "Increase servings" }).click();
  await page.evaluate(() =>
    window.recipeHydrationFixture.update({
      isLoaded: true,
      isSignedIn: true,
      userId: "user-a",
      isAuthenticated: true,
      isLoading: false,
      account: null,
    }),
  );
  await expect(
    page.getByRole("complementary", { name: "Account connection" }),
  ).toBeVisible();
  await page.evaluate(() =>
    window.recipeHydrationFixture.update({
      recovery: "succeed",
      household: null,
    }),
  );
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    page.getByRole("complementary", { name: "Account connection" }),
  ).toHaveCount(0);
  await expect(recipe).toHaveAttribute("data-recipe-instance", instance!);
  await expect(
    page.getByRole("button", { name: "Serves 5", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: `Save ${title}`, exact: true }),
  ).toBeEnabled();
  expect(
    await page.evaluate(() => window.recipeHydrationFixture.counts.mutations),
  ).toEqual(["users:ensureCurrent", "users:ensureCurrent"]);
});
