import { expect, test } from "@playwright/test";
import inventory from "../../docs/recipe-url-inventory.json";

const origin = "https://www.foodedo.com";
const recipePath = "/recipes/beef-lasagne";

test("query recipe pages reserve the header and image space before hydration", async ({
  browser,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 390, height: 844 },
  });
  try {
    const page = await context.newPage();
    for (const query of [
      "recipeId=private-recipe&servings=2&planServings=2",
      "slug=beef-lasagne",
    ]) {
      await page.goto(`http://127.0.0.1:3100/recipes/view?${query}`);
      await expect(
        page.getByRole("link", { name: "Foodedo", exact: true }),
      ).toBeVisible();
      const header = await page.locator("header").boundingBox();
      const loading = await page
        .getByRole("main", { name: "Loading recipe" })
        .boundingBox();
      expect(header?.height).toBe(54);
      expect(loading?.y).toBe(54);
      await expect(
        page.getByRole("navigation", { name: "Primary" }),
      ).toBeVisible();
      await expect(page.getByRole("status")).toHaveCSS("position", "absolute");
    }
  } finally {
    await context.close();
  }
});

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

test("recipe details retain ISR while the directory renders query-specific HTML", async ({
  request,
}) => {
  for (const [path, seconds] of [[recipePath, 86400]] as const) {
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
  const directory = await request.get("/recipes?page=2");
  expect(directory.status()).toBe(200);
  expect(directory.headers()["x-nextjs-cache"]).toBeUndefined();
  expect(await directory.text()).toContain(
    'href="https://www.foodedo.com/recipes?page=2"',
  );
  const html = await (await request.get(recipePath)).text();
  expect(html).toContain(`rel="canonical" href="${origin}${recipePath}"`);
  expect(html).toContain("Ingredients");
  expect(html).toContain("Method");
  expect(html).toContain('aria-label="Save recipe"');
  expect((html.match(/<h1[ >]/g) ?? []).length).toBe(1);
  const match =
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html);
  const data = JSON.parse(match![1]);
  expect(data).toMatchObject({ "@type": "Recipe", name: "Beef Lasagne" });
  expect(data.recipeIngredient.length).toBeGreaterThan(0);
  expect(data.recipeInstructions.length).toBeGreaterThan(0);
});

test("the favourite stays visible while recipe and session scripts are unavailable", async ({
  page,
}) => {
  await page.route(/clerk|convex/, (route) => route.abort());
  await page.goto(recipePath);
  await expect(
    page.getByRole("heading", { name: "Beef Lasagne", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save recipe", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save recipe", exact: true }),
  ).toBeDisabled();
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
  // The directory renders its first 20 recipes. Continuation pages and the
  // sitemap both expose the complete catalogue; organic-discovery tests follow the links.
  expect(directory).toMatch(/href="\/recipes\/[a-z0-9-]+"/);
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
  const servingsControl = page.getByRole("button", { name: /^Serves/ });
  let expectedServings = String(reference.recipeYield);
  if (await servingsControl.count()) {
    await servingsControl.click();
    await page.getByRole("button", { name: /increase/i }).click();
    expectedServings = (await servingsControl.innerText()).match(/\d+/)![0];
  } else {
    // Source-only quantities deliberately prevent scaling; cooking must retain
    // the authored servings instead of requiring a control that is unavailable.
    await expect(
      page.getByText("Quantities are kept as written by the author."),
    ).toBeVisible();
    await expect(
      page.getByText(`Serves ${reference.recipeYield}`, { exact: true }),
    ).toBeVisible();
  }
  await page.getByRole("button", { name: "Start cooking" }).first().click();
  await expect(page).toHaveURL(/\/recipes\/cook\?/);
  const url = new URL(page.url());
  expect(url.searchParams.get("slug")).toBe("beef-lasagne");
  expect(url.searchParams.get("catalogueMealId")).toBe(reference.identifier);
  expect(url.searchParams.get("catalogueVersion")).toBe(
    String(reference.version),
  );
  expect(url.searchParams.get("servings")).toBe(expectedServings);
});

test("recipe sharing serves a compact JPEG through the Open Graph image URL", async ({
  request,
}) => {
  const response = await request.get(recipePath, {
    headers: { "User-Agent": "WhatsApp/2.0" },
  });
  const html = await response.text();
  const imagePath = `${recipePath}/social-image`;
  expect(html).toContain(`property="og:image" content="${origin}${imagePath}"`);
  expect(html).toContain('property="og:image:width" content="1200"');
  expect(html).toContain('property="og:image:height" content="630"');
  const image = await request.get(imagePath);
  expect(image.status()).toBe(200);
  expect(image.headers()["content-type"]).toBe("image/jpeg");
  expect(image.headers()["cache-control"]).toContain("max-age=2592000");
  const body = await image.body();
  expect(body[0]).toBe(0xff);
  expect(body[1]).toBe(0xd8);
  expect(body.byteLength).toBeLessThan(300_000);
  expect(
    (await request.get("/recipes/no-such-recipe/social-image")).status(),
  ).toBe(404);
});

test("recipe cross-links render without JavaScript and vary between pages", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    const selections: string[][] = [];
    for (const slug of ["beef-lasagne", "chicken-katsu-curry"]) {
      await page.goto(`/recipes/${slug}`);
      const section = page
        .getByRole("region", { name: "More recipes to try", exact: true })
        .first();
      const links = section.getByRole("list").getByRole("link");
      await expect(links).toHaveCount(6);
      const hrefs = await links.evaluateAll((elements) =>
        elements.map((element) => element.getAttribute("href")!),
      );
      expect(new Set(hrefs).size).toBe(6);
      expect(hrefs).not.toContain(`/recipes/${slug}`);
      expect(hrefs.every((href) => /^\/recipes\/[a-z0-9-]+$/.test(href))).toBe(
        true,
      );
      selections.push(hrefs.sort());
    }
    expect(selections[0]).not.toEqual(selections[1]);
  } finally {
    await context.close();
  }
});
