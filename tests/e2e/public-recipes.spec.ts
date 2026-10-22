import { expect, test } from "@playwright/test";
import inventory from "../../docs/recipe-url-inventory.json";

const origin = "https://www.foodedo.com";
const recipePath = "/recipes/beef-lasagne";

test("the shared recipe list hydrates search from its server seed", async ({
  page,
}) => {
  await page.route(/clerk|convex/, (route) => route.abort());
  await page.goto("/recipes");
  await page
    .getByRole("textbox", { name: "Search recipes" })
    .fill("Beef Lasagne");
  await expect(page.getByRole("link", { name: /Beef Lasagne/ })).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Chicken Katsu Curry/ }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: /Beef Lasagne/ }).click();
  await expect(page).toHaveURL(/\/recipes\/beef-lasagne$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Beef Lasagne",
  );
});

test("public directory and recipes serve static HTML with the agreed cache lifetimes", async ({
  request,
}) => {
  for (const [path, seconds] of [
    ["/recipes", 1800],
    [recipePath, 86400],
  ] as const) {
    await expect
      .poll(async () => {
        const response = await request.get(path);
        expect(response.status()).toBe(200);
        expect(response.headers()["cache-control"]).toContain(
          `s-maxage=${seconds}`,
        );
        return response.headers()["x-nextjs-cache"];
      })
      .toBe("HIT");
  }
  const html = await (await request.get(recipePath)).text();
  expect(html).toContain(`rel="canonical" href="${origin}${recipePath}"`);
  expect(html).toContain("Ingredients");
  expect(html).toContain("Method");
  expect((html.match(/<h1[ >]/g) ?? []).length).toBe(1);
  const match =
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html);
  const data = JSON.parse(match![1]);
  expect(data).toMatchObject({ "@type": "Recipe", name: "Beef Lasagne" });
  expect(data.recipeIngredient.length).toBeGreaterThan(0);
  expect(data.recipeInstructions.length).toBeGreaterThan(0);
});

test("all legacy recipe URLs have a tested migration outcome and public discovery", async ({
  request,
}) => {
  test.setTimeout(120_000);
  const redirect = await request.get("/discover?utm_source=old", {
    maxRedirects: 0,
  });
  expect(redirect.status()).toBe(308);
  expect(redirect.headers().location).toBe("/recipes?utm_source=old");
  const directory = await (await request.get("/recipes")).text();
  const xml = await (await request.get("/sitemap.xml")).text();
  expect(xml).toContain(`<loc>${origin}/recipes</loc>`);
  expect(xml).not.toContain("/discover");
  expect(xml).not.toContain("/recipes/view?");
  for (const entry of inventory.recipes) {
    const legacy = await request.get(entry.path, { maxRedirects: 0 });
    expect(legacy.status(), entry.path).toBe(308);
    expect(legacy.headers().location).toBe(entry.canonicalPath);
    const response = await request.get(entry.canonicalPath);
    if (entry.outcome === "intentional-404") {
      expect(response.status(), entry.path).toBe(404);
      expect(xml).not.toContain(`<loc>${origin}${entry.canonicalPath}</loc>`);
      continue;
    }
    expect(response.status(), entry.path).toBe(200);
    expect(directory, entry.path).toContain(`href="${entry.canonicalPath}"`);
    expect(xml, entry.path).toContain(
      `<loc>${origin}${entry.canonicalPath}</loc>`,
    );
    const html = await response.text();
    expect(html, entry.path).toContain(
      `rel="canonical" href="${origin}${entry.canonicalPath}"`,
    );
  }
  expect(
    (await request.get("/discover/recipe/this-recipe-does-not-exist")).status(),
  ).toBe(404);
  expect(
    await (await request.get("/recipes/view?slug=beef-lasagne")).text(),
  ).toContain('name="robots" content="noindex"');
});

test("public recipes remain readable without JavaScript", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto(recipePath);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Beef Lasagne",
    );
    await expect(
      page.getByRole("heading", { name: "Ingredients", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Method", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("link", { name: "Recipes" })
      .click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Recipes",
    );
  } finally {
    await context.close();
  }
});

test("mobile reading and Start cooking retain the displayed revision and selected servings", async ({
  page,
  request,
}) => {
  const html = await (await request.get(recipePath)).text();
  const reference = JSON.parse(
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)![1],
  );
  await page.route(/clerk|convex/, (route) => route.abort());
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    for (const path of ["/recipes", recipePath]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await expect(
        page.getByRole("navigation", { name: "Primary" }),
      ).toBeVisible();
    }
  }
  await page.getByRole("button", { name: /^Serves/ }).click();
  await page.getByRole("button", { name: /increase/i }).click();
  const selected = await page
    .getByRole("button", { name: /^Serves/ })
    .innerText();
  await page.getByRole("button", { name: "Start cooking" }).first().click();
  await expect(page).toHaveURL(/\/recipes\/cook\?/);
  const url = new URL(page.url());
  expect(url.searchParams.get("slug")).toBe("beef-lasagne");
  expect(url.searchParams.get("catalogueMealId")).toBe(reference.identifier);
  expect(url.searchParams.get("catalogueVersion")).toBe(
    String(reference.version),
  );
  expect(url.searchParams.get("servings")).toBe(selected.match(/\d+/)![0]);
});
