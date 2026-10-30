import { expect, test } from "@playwright/test";
import { load } from "cheerio";

const supportingPaths = [
  "/combine-recipes-into-one-grocery-list",
  "/how-to-make-a-shopping-list-from-recipes",
  "/meal-planner-with-grocery-list",
  "/blog/how-to-turn-recipes-into-one-grocery-list",
  "/blog/how-to-combine-ingredients-from-multiple-recipes",
  "/blog/weekly-meal-plan-and-shopping-list-guide",
  "/blog/how-to-build-shopping-list-from-meal-plan",
];

test("homepage HTML contains useful public content and its own canonical", async ({
  request,
  browser,
}) => {
  const response = await request.get("/");
  expect(response.status()).toBe(200);
  // Public content remains available without JS; unresolved sessions see only
  // the loading view when scripting is enabled, avoiding a Welcome flash.
  const html = await response.text();
  const scripted = load(html);
  expect(scripted('[aria-label="Loading Foodedo"]').length).toBe(1);
  expect(scripted("h1").length).toBe(0);
  const $ = load(html, { scriptingEnabled: false });
  expect($("h1").text()).toBe("Make food decisions easier.");
  expect($("link[rel=canonical]")).toHaveLength(1);
  expect($("link[rel=canonical]").attr("href")).toBe(
    "https://www.foodedo.com/",
  );
  for (const href of ["/recipes", "/recipe-to-shopping-list", "/blog"])
    expect($(`main a[href="${href}"]`).length).toBeGreaterThan(0);
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page
      .getByRole("link", { name: "Recipes to shopping list", exact: true })
      .click();
    await expect(page).toHaveURL(/\/recipe-to-shopping-list$/);
  } finally {
    await context.close();
  }
});

test("the worked list and its supporting links are present without JavaScript", async ({
  request,
  browser,
}) => {
  for (const path of supportingPaths) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    const $ = load(await response.text());
    const links = $('article a[href="/recipe-to-shopping-list"]');
    expect(links.length, path).toBeGreaterThan(0);
    expect(links.text(), path).toMatch(/three real recipes|three-recipe/i);
    expect($("link[rel=canonical]").attr("href")).toBe(
      `https://www.foodedo.com${path}`,
    );
  }
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 320, height: 740 },
  });
  try {
    const page = await context.newPage();
    await page.goto("/recipe-to-shopping-list");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Turn recipes into one shopping list",
    );
    await expect(
      page.getByText("550 g broccoli", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Check your cupboards" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const recipes = page.locator('article a[href^="/recipes/"]');
    await expect(recipes).toHaveCount(3);
    await recipes.first().click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Chicken Shawarma",
    );
  } finally {
    await context.close();
  }
});

test("recipe pagination reaches every public recipe through HTML links", async ({
  request,
  page,
}) => {
  const xml = load(await (await request.get("/sitemap.xml")).text(), {
    xmlMode: true,
  });
  const expected = xml("loc")
    .toArray()
    .map((element) => new URL(xml(element).text()).pathname)
    .filter((path) => /^\/recipes\/[a-z0-9-]+$/.test(path));
  const discovered = new Set<string>();
  const visited = new Set<string>();
  let path: string | undefined = "/recipes";
  while (path) {
    expect(visited.has(path)).toBe(false);
    visited.add(path);
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    const $ = load(await response.text());
    expect($("link[rel=canonical]").attr("href")).toBe(
      `https://www.foodedo.com${path}`,
    );
    const recipes = $('main a[href^="/recipes/"]')
      .toArray()
      .map((element) => $(element).attr("href")!)
      .filter((href) => expected.includes(href));
    expect(recipes.length).toBeGreaterThan(0);
    expect(recipes.length).toBeLessThanOrEqual(20);
    for (const recipe of recipes) {
      expect(discovered.has(recipe), recipe).toBe(false);
      discovered.add(recipe);
    }
    path = $('nav[aria-label="Recipe pages"] a')
      .toArray()
      .map((element) => $(element).attr("href")!)
      .find((href) => /^\/recipes\?page=\d+$/.test(href) && !visited.has(href));
  }
  expect([...discovered].sort()).toEqual(expected.sort());
  await page.route(/clerk|convex/, (route) => route.abort());
  await page.goto("/recipes?page=2");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Recipes");
  await expect(page.locator('main ul a[href^="/recipes/"]')).toHaveCount(20);
  await page.setViewportSize({ width: 320, height: 740 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(
    page.getByRole("textbox", { name: "Search recipes" }),
  ).toBeVisible();
});

test("invalid directory pages fail honestly and page one redirects with its query", async ({
  request,
}) => {
  for (const value of [
    "0",
    "-1",
    "01",
    "2.5",
    "invalid",
    "999999999999999999999",
  ])
    expect((await request.get(`/recipes?page=${value}`)).status()).toBe(404);
  const response = await request.get("/recipes/page/1?source=legacy", {
    maxRedirects: 0,
  });
  expect(response.status()).toBe(308);
  expect(response.headers().location).toBe("/recipes?source=legacy");
  expect((await request.get("/recipes?page=99999")).status()).toBe(404);
  const oldPage = await request.get("/recipes/page/2?source=legacy", {
    maxRedirects: 0,
  });
  expect(oldPage.status()).toBe(308);
  const location = new URL(
    oldPage.headers().location,
    "https://www.foodedo.com",
  );
  expect(location.pathname).toBe("/recipes");
  expect(location.searchParams.get("page")).toBe("2");
  expect(location.searchParams.get("source")).toBe("legacy");
});

test("query filters and sorting are reflected in initial server HTML without JavaScript", async ({
  request,
  browser,
}) => {
  const response = await request.get("/recipes?protein=fish&sort=quickest");
  expect(response.status()).toBe(200);
  const $ = load(await response.text());
  const cards = $("main ul > li");
  expect(cards.length).toBeGreaterThan(0);
  cards.each((_, card) => expect($(card).text()).toContain("Fish"));
  expect($("meta[name=robots]").attr("content")).toContain("noindex");
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto("/recipes?page=2");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Recipes");
    await expect(
      page
        .getByRole("navigation", { name: "Recipe pages" })
        .getByRole("link", { name: "Next", exact: true }),
    ).toHaveAttribute("href", "/recipes?page=3");
  } finally {
    await context.close();
  }
});

test("web search pagination survives refresh and Back without changing the interface", async ({
  page,
}) => {
  await page.goto("/recipes?page=2");
  await page.getByRole("textbox", { name: "Search recipes" }).fill("chicken");
  await expect(page).toHaveURL(/\/recipes\?q=chicken$/);
  const cards = page.locator("main ul > li");
  await expect(cards).toHaveCount(20);
  const first = await cards.getByRole("link").first().getAttribute("href");
  await page
    .getByRole("navigation", { name: "Recipe pages" })
    .getByRole("link", { name: "Next", exact: true })
    .click();
  await expect(page).toHaveURL(/q=chicken&page=2$/);
  await expect(cards.first()).toBeVisible();
  await expect(cards.getByRole("link").first()).not.toHaveAttribute(
    "href",
    first!,
  );
  const second = await cards.getByRole("link").first().getAttribute("href");
  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "Search recipes" }),
  ).toHaveValue("chicken");
  await expect(cards.getByRole("link").first()).toHaveAttribute(
    "href",
    second!,
  );
  await page.goBack();
  await expect(page).toHaveURL(/\/recipes\?q=chicken$/);
  await expect(cards.getByRole("link").first()).toHaveAttribute("href", first!);
  await expect(
    page.getByRole("button", { name: "Load more", exact: true }),
  ).toHaveCount(0);
});

test("one coherent pager fits mobile and desktop without wrapping controls", async ({
  page,
}) => {
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/recipes?page=4");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Recipes");
    await expect(
      page.getByRole("textbox", { name: "Search recipes" }),
    ).toBeVisible();
    const pagination = page.getByRole("navigation", { name: "Recipe pages" });
    await expect(pagination).toHaveCount(1);
    await expect(
      page.getByRole("button", { name: "Load more", exact: true }),
    ).toHaveCount(0);
    await pagination.scrollIntoViewIfNeeded();
    expect((await pagination.boundingBox())!.height).toBeLessThanOrEqual(48);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({ path: `/tmp/foodedo-pagination-${width}.png` });
  }
});
