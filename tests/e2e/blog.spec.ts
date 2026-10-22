import { expect, test } from "@playwright/test";
import inventory from "../../docs/blog-url-inventory.json";

test("serves the index, articles and sitemap from the full route cache", async ({
  request,
}) => {
  for (const route of [
    "/blog",
    "/blog/stop-asking-whats-for-dinner-foodedo",
    "/sitemap.xml",
  ]) {
    await expect
      .poll(
        async () => {
          const response = await request.get(route);
          expect(response.status()).toBe(200);
          expect(response.headers()["cache-control"]).toContain("s-maxage=60");
          return response.headers()["x-nextjs-cache"];
        },
        {
          timeout: 15_000,
          message: `${route} should settle on a cached response`,
        },
      )
      .toBe("HIT");
  }
});

test("blog HTML lists every migrated URL without app chrome or account providers", async ({
  request,
  page,
}) => {
  const response = await request.get("/blog");
  expect(response.status()).toBe(200);
  const html = await response.text();
  for (const article of [...inventory.cmsArticles, ...inventory.localGuides])
    expect(html).toContain(`href="${article.path}"`);
  expect(html).toContain('rel="canonical" href="https://www.foodedo.com/blog"');
  expect(html).not.toMatch(/clerk\.browser|clerk-js|clerk\.accounts/);
  await page.route(/clerk|convex/, (route) => route.abort());
  await page.goto("/blog");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "A little less thinking.A little more cooking.",
  );
  await expect(page.getByRole("navigation", { name: "Primary" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("navigation", { name: "Public navigation" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("all 33 migrated articles serve initial HTML and matching metadata", async ({
  request,
}) => {
  test.setTimeout(90_000);
  for (const article of [...inventory.cmsArticles, ...inventory.localGuides]) {
    const response = await request.get(article.path);
    expect(response.status(), article.path).toBe(200);
    const html = await response.text();
    expect(html, article.path).toContain(
      `href="https://www.foodedo.com${article.path}"`,
    );
    const structured =
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html);
    expect(structured, article.path).not.toBeNull();
    expect(JSON.parse(structured![1])).toMatchObject({
      "@type": "BlogPosting",
      headline: article.title,
    });
    expect((html.match(/<h1[ >]/g) ?? []).length, article.path).toBe(1);
    expect(html, article.path).not.toMatch(
      /href="(?:https:\/\/(?:www\.)?foodedo\.com)?\/(?:dashboard|sign-up|pricing)(?:[/?"#])/,
    );
  }
  expect(
    (await request.get("/blog/this-article-does-not-exist")).status(),
  ).toBe(404);
});

test("sitemap and robots expose every article while preserving catalogue URLs", async ({
  request,
}) => {
  const response = await request.get("/sitemap.xml");
  expect(response.status()).toBe(200);
  const xml = await response.text();
  for (const article of [...inventory.cmsArticles, ...inventory.localGuides])
    expect(xml).toContain(`<loc>https://www.foodedo.com${article.path}</loc>`);
  expect(xml).toContain("/recipes/");
  const robots = await request.get("/robots.txt");
  expect(await robots.text()).toContain(
    "Sitemap: https://www.foodedo.com/sitemap.xml",
  );
});

test("reading and navigating articles works without JavaScript", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(
    "http://127.0.0.1:3100/blog/how-to-build-a-weekly-meal-plan-in-15-minutes",
  );
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "How to Build a Weekly Meal Plan in 15 Minutes",
  );
  await expect(
    page.getByText("Check your calendar and mark your busiest nights first.", {
      exact: false,
    }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Back to Blog" }).click();
  await expect(page).toHaveURL(/\/blog$/);
  await context.close();
});

test("blog CTA enters the guest product directly, including a fresh tab", async ({
  page,
  context,
}) => {
  await page.goto("/blog/how-to-build-a-weekly-meal-plan-in-15-minutes");
  const newTab = await context.newPage();
  await newTab.goto("/?try=1");
  await expect(
    newTab.getByRole("heading", { name: "Dinner, decided." }),
  ).toBeVisible();
  await expect(
    newTab.getByRole("heading", { name: "Make food decisions easier." }),
  ).toHaveCount(0);
  await newTab.close();
  await page
    .getByRole("navigation", { name: "Public navigation" })
    .getByRole("link", { name: "Try Foodedo" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Dinner, decided." }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Make food decisions easier." }),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Dinner, decided." }),
  ).toBeVisible();
});

test("returning from the blog preserves an existing guest plan", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.goto("/?try=1");
  await page.getByRole("button", { name: "Plan my week" }).click();
  await expect(
    page.getByRole("heading", { name: "Your week is ready" }),
  ).toBeVisible({ timeout: 15_000 });
  const meals = await page
    .getByRole("button", { name: /^Actions for / })
    .evaluateAll((buttons) =>
      buttons.map((button) => button.getAttribute("aria-label")),
    );
  expect(meals).toHaveLength(7);
  await page.goto("/blog");
  await page
    .getByRole("navigation", { name: "Public navigation" })
    .getByRole("link", { name: "Try Foodedo" })
    .click();
  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: "Week", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your week is ready" }),
  ).toBeVisible();
  expect(
    await page
      .getByRole("button", { name: /^Actions for / })
      .evaluateAll((buttons) =>
        buttons.map((button) => button.getAttribute("aria-label")),
      ),
  ).toEqual(meals);
});
