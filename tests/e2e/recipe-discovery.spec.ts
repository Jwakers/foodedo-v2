import { expect, test } from "@playwright/test";
import { build } from "vite";
import { createGuestDraft } from "../../src/lib/domain/guest-draft";
import path from "node:path";
import { readFileSync, readdirSync } from "node:fs";
test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
let javascript = "";
let stylesheet = "";
test.beforeAll(async () => {
  // Use the web build's actual Tailwind output so responsive assertions exercise
  // production layout, rather than an unstyled component harness.
  const cssRoot = path.resolve(".next/static/css");
  stylesheet = readdirSync(cssRoot, { recursive: true })
    .filter((file) => String(file).endsWith(".css"))
    .map((file) => readFileSync(path.join(cssRoot, String(file)), "utf8"))
    .join("\n");
  const fixture = path.resolve("tests/browser-fixtures/discovery");
  const result = await build({
    configFile: false,
    logLevel: "error",
    define: {
      "process.env.NODE_ENV": JSON.stringify("production"),
      "process.env.NEXT_PUBLIC_POSTHOG_KEY": JSON.stringify(""),
      "process.env.NEXT_PUBLIC_CAPACITOR_BUILD": JSON.stringify("false"),
    },
    resolve: {
      alias: {
        "@/features/auth/use-foodedo-auth": path.resolve(
          "tests/browser-fixtures/household/auth.ts",
        ),
        "@": path.resolve("src"),
        "next/navigation": path.resolve(
          "tests/browser-fixtures/household/navigation.ts",
        ),
        "convex/react": path.join(fixture, "convex.ts"),
        "convex-helpers/react": path.join(fixture, "convex.ts"),
        "@clerk/react": path.join(fixture, "clerk.ts"),
        "next/image": path.resolve(
          "tests/browser-fixtures/catalogue-admin/next.tsx",
        ),
        "next/link": path.resolve(
          "tests/browser-fixtures/catalogue-admin/link.tsx",
        ),
      },
    },
    build: {
      write: false,
      minify: false,
      lib: {
        entry: path.join(fixture, "entry.tsx"),
        formats: ["iife"],
        name: "DiscoveryFixture",
      },
    },
  });
  const bundle = Array.isArray(result) ? result[0] : result;
  if (!("output" in bundle))
    throw new Error("Expected an in-memory browser bundle");
  javascript = bundle.output
    .filter((item) => item.type === "chunk")
    .map((item) => item.code)
    .join("\n");
});
test.beforeEach(async ({ page }) => {
  await page.route(
    /^https?:\/\/(discovery\.fixture|localhost:4317)\//,
    async (route) => {
      if (new URL(route.request().url()).pathname === "/app.js")
        await route.fulfill({
          contentType: "application/javascript",
          body: javascript,
        });
      else if (new URL(route.request().url()).pathname === "/app.css")
        await route.fulfill({ contentType: "text/css", body: stylesheet });
      else
        await route.fulfill({
          contentType: "text/html",
          body: '<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/app.css"><style>:root{--font-dm-sans:Arial;--font-fraunces:Georgia}</style></head><body><div id="root"></div><script src="/app.js"></script></body></html>',
        });
    },
  );
});

const region = (page: import("@playwright/test").Page) =>
  page.getByRole("region", { name: "Meals you might like", exact: true });

test("native-style recipe listing retains one Load more control and appends batches", async ({
  page,
}) => {
  await page.goto("https://discovery.fixture/?surfaces&pagination");
  const listing = page
    .getByRole("heading", { name: "Ideas for you", exact: true })
    .locator("..")
    .locator("..");
  await expect(listing.getByRole("listitem")).toHaveCount(20);
  await expect(
    listing.getByRole("button", { name: "Load more", exact: true }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("navigation", { name: "Recipe pages" }),
  ).toHaveCount(0);
  await listing.getByRole("button", { name: "Load more", exact: true }).click();
  await expect(listing.getByRole("listitem")).toHaveCount(40);
});
const destinations = (page: import("@playwright/test").Page) =>
  region(page)
    .locator("li a")
    .evaluateAll((links) => links.map((a) => a.getAttribute("href")));

test("personal saves and the selected household plan are excluded; cards stay put until the next visit", async ({
  page,
}) => {
  await page.goto("https://discovery.fixture/");
  await expect(region(page).getByRole("listitem")).toHaveCount(6);
  const links = await destinations(page);
  expect(links).not.toContain("/recipes/view?slug=meal-0");
  expect(links).not.toContain("/recipes/view?slug=meal-2");
  const card = region(page).getByRole("listitem").first();
  const heart = card.getByRole("button");
  await heart.click();
  await expect(heart).toHaveAttribute("aria-pressed", "true");
  expect(await destinations(page)).toEqual(links);
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("fixture:discovery-requests"),
    ),
  ).toBe("1");
  await heart.click();
  await expect(heart).toHaveAttribute("aria-pressed", "false");
  expect(await destinations(page)).toEqual(links);
  await heart.click();
  await expect(heart).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Leave Home" }).click();
  await page.getByRole("button", { name: "Return Home" }).click();
  await expect(region(page).getByRole("listitem")).toHaveCount(6);
  expect(await destinations(page)).not.toContain(links[0]);
  expect(page.url()).toBe("https://discovery.fixture/");
});

test("switching spaces resets discovery and excludes the new space's plan", async ({
  page,
}) => {
  await page.goto("https://discovery.fixture/");
  await expect(region(page).getByRole("listitem")).toHaveCount(6);
  await page.getByRole("button", { name: "Private space" }).click();
  await expect(region(page).getByRole("listitem")).toHaveCount(6);
  expect(await destinations(page)).not.toContain("/recipes/view?slug=meal-3");
  expect(await destinations(page)).not.toContain("/recipes/view?slug=meal-0");
});

test("failed saves stay unsaved and can be retried", async ({ page }) => {
  await page.goto("https://discovery.fixture/");
  const heart = region(page).getByRole("listitem").first().getByRole("button");
  await expect(heart).toBeVisible();
  await page.evaluate(() =>
    sessionStorage.setItem("fixture:fail-save", "true"),
  );
  const before = await destinations(page);
  await heart.click();
  await expect(
    page.getByText("Foodedo couldn’t update this saved recipe. Try again."),
  ).toBeVisible();
  await expect(heart).toHaveAttribute("aria-pressed", "false");
  expect(await destinations(page)).toEqual(before);
  await page.evaluate(() => sessionStorage.removeItem("fixture:fail-save"));
  await heart.click();
  await expect(heart).toHaveAttribute("aria-pressed", "true");
});

test("discovery hearts update before the server and roll back failed saves without a spinner", async ({
  page,
}) => {
  await page.goto("https://discovery.fixture/");
  await page.evaluate(() => {
    sessionStorage.setItem("fixture:save-delay", "800");
    sessionStorage.setItem("fixture:fail-save", "true");
  });
  const heart = region(page).getByRole("listitem").first().getByRole("button");
  await heart.click();
  await expect(heart).toHaveAttribute("aria-pressed", "true");
  await expect(heart).toBeEnabled();
  await expect(heart).not.toHaveAttribute("aria-busy", "true");
  await expect(
    page.getByText("Foodedo couldn’t update this saved recipe. Try again."),
  ).toBeVisible();
  await expect(heart).toHaveAttribute("aria-pressed", "false");
});

test("listing and recipe header hearts stay in sync during rapid reversals and failed unsaves", async ({
  page,
}) => {
  await page.goto("https://discovery.fixture/?surfaces");
  await page.evaluate(() =>
    sessionStorage.setItem("fixture:save-delay", "600"),
  );
  const header = page.getByRole("region", { name: "Recipe header" });
  const headerHeart = header.getByRole("button", {
    name: /^(Unsave|Save) Dinner 1$/,
  });
  const grid = page
    .getByRole("heading", { name: "Ideas for you", exact: true })
    .locator("..")
    .locator("..");
  const gridHeart = grid.getByRole("button", {
    name: /^(Unsave|Save) Dinner 1$/,
  });
  await headerHeart.click();
  await expect(gridHeart).toHaveAttribute("aria-pressed", "true");
  expect(
    await page.evaluate(() =>
      JSON.parse(sessionStorage.getItem("fixture:saved") ?? "[]"),
    ),
  ).not.toContain("meal-1");
  await gridHeart.click();
  await expect(headerHeart).toHaveAttribute("aria-pressed", "false");
  await headerHeart.click();
  await expect(gridHeart).toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(() =>
      page.evaluate(() =>
        JSON.parse(sessionStorage.getItem("fixture:saved") ?? "[]"),
      ),
    )
    .toContain("meal-1");
  // Wait for all three queued requests, then verify rollback of a failed unsave.
  await expect
    .poll(() =>
      page.evaluate(() => sessionStorage.getItem("fixture:pending-saves")),
    )
    .toBe("0");
  await page.evaluate(() =>
    sessionStorage.setItem("fixture:fail-save", "true"),
  );
  await gridHeart.click();
  await expect(headerHeart).toHaveAttribute("aria-pressed", "false");
  await expect(gridHeart).toBeEnabled();
  await expect(
    page.getByText("Foodedo couldn’t update this saved recipe. Try again."),
  ).toBeVisible();
  await expect(headerHeart).toHaveAttribute("aria-pressed", "true");
  await expect(gridHeart).toHaveAttribute("aria-pressed", "true");
});

test("guest heart taps on mobile preserve save intent through sign-in", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("https://discovery.fixture/?role=guest&empty");
  const first = region(page).getByRole("listitem").first();
  const href = await first.getByRole("link").getAttribute("href");
  const heart = first.getByRole("button");
  const target = await heart.evaluate((button) => {
    const bounds = button.getBoundingClientRect();
    const extension = getComputedStyle(button, "::before");
    return {
      width:
        bounds.width - parseFloat(extension.left) - parseFloat(extension.right),
      height:
        bounds.height -
        parseFloat(extension.top) -
        parseFloat(extension.bottom),
    };
  });
  expect(target.width).toBeGreaterThanOrEqual(44);
  expect(target.height).toBeGreaterThanOrEqual(44);
  await first.getByRole("button").tap();
  await expect(
    page.getByRole("dialog", { name: "Sign in", exact: true }),
  ).toBeVisible();
  expect(page.url()).toBe("https://discovery.fixture/?role=guest&empty");
  await page.getByRole("button", { name: "Complete sign-in" }).click();
  const id = new URL(href!, "https://discovery.fixture").searchParams.get(
    "slug",
  )!;
  await expect
    .poll(() =>
      page.evaluate(() =>
        JSON.parse(sessionStorage.getItem("fixture:saved") ?? "[]"),
      ),
    )
    .toContain(id);
});

test("recipe carousels have hearts while the meal plan does not", async ({
  page,
}) => {
  await page.goto("https://discovery.fixture/?full");
  await expect(region(page).getByRole("listitem")).toHaveCount(6);
  await expect(
    region(page).getByRole("button", { name: /^Save / }),
  ).toHaveCount(6);
  const latest = page.getByRole("region", { name: "Latest recipes" });
  const rest = page.getByRole("region", { name: "Meals in your plan" });
  await expect(
    latest.getByRole("button", { name: /^(Save|Unsave) / }),
  ).toHaveCount(18);
  await expect(rest.getByRole("button", { name: /Save / })).toHaveCount(0);
  expect(
    await page
      .locator("main section[aria-labelledby]")
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("aria-labelledby")),
      ),
  ).toEqual(
    expect.arrayContaining(["latest-recipes-heading", "discovery-heading"]),
  );
  const save = latest.getByRole("button", {
    name: "Save Dinner 1",
    exact: true,
  });
  await expect(save).toHaveCSS("width", "32px");
  await save.click();
  await expect(
    latest.getByRole("button", { name: "Unsave Dinner 1", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const latestY = (await latest.boundingBox())!.y;
  expect((await region(page).boundingBox())!.y).toBeGreaterThan(latestY);
});

test("waits for saved recipes and hides discovery when the catalogue is exhausted", async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("fixture:saved"))
      sessionStorage.setItem("fixture:saved-loading", "true");
  });
  await page.goto("https://discovery.fixture/");
  await expect(region(page).getByRole("listitem")).toHaveCount(0);
  await expect(region(page).getByRole("status")).toBeVisible();
  await page.evaluate(() => {
    sessionStorage.removeItem("fixture:saved-loading");
    sessionStorage.setItem(
      "fixture:saved",
      JSON.stringify(Array.from({ length: 18 }, (_, i) => `meal-${i}`)),
    );
  });
  await page.goto("https://discovery.fixture/?empty");
  await expect(region(page)).toHaveCount(0);
});

test("guest discovery is stable across visits during the day and rotates the next day", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2030-11-01T12:00:00Z"));
  await page.goto("https://discovery.fixture/?role=guest&empty");
  await expect(region(page).getByRole("listitem")).toHaveCount(6);
  const first = await destinations(page);
  await page.getByRole("button", { name: "Leave Home" }).click();
  await page.getByRole("button", { name: "Return Home" }).click();
  await expect(region(page).getByRole("listitem")).toHaveCount(6);
  expect(await destinations(page)).toEqual(first);
  await page.clock.setFixedTime(new Date("2030-11-02T12:00:00Z"));
  // Crossing midnight does not rearrange the row while somebody is browsing.
  expect(await destinations(page)).toEqual(first);
  await page.getByRole("button", { name: "Leave Home" }).click();
  await page.getByRole("button", { name: "Return Home" }).click();
  await expect(region(page).getByRole("listitem")).toHaveCount(6);
  expect(await destinations(page)).not.toEqual(first);
});

test("guest discovery excludes an elapsed local draft without changing it", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2030-11-01T12:00:00Z"));
  await page.goto("https://discovery.fixture/?role=guest&empty");
  await expect(region(page).getByRole("listitem")).toHaveCount(6);
  const draft = createGuestDraft({
    planStartDate: "2030-10-01",
    planDays: 3,
    now: new Date("2030-11-01T12:00:00Z").getTime(),
    catalogueMeals: [0, 1, 2].map((index) => ({
      catalogueMealId: `meal-${index}`,
      catalogueVersion: 1,
    })),
  });
  await page.evaluate(async (draft) => {
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open("foodedo");
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const transaction = db.transaction("guest-drafts", "readwrite");
        transaction.objectStore("guest-drafts").put(draft, "current");
        transaction.oncomplete = () => {
          db.close();
          resolve();
        };
        transaction.onerror = () => reject(transaction.error);
      };
    });
  }, draft);
  await page.reload();
  await expect(region(page).getByRole("listitem")).toHaveCount(6);
  const actual = await destinations(page);
  for (const choice of draft.mealChoices)
    expect(actual).not.toContain(
      `/recipes/view?slug=${choice.catalogueMealId}`,
    );
  const stored = await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open("foodedo");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const request = db
            .transaction("guest-drafts", "readonly")
            .objectStore("guest-drafts")
            .get("current");
          request.onsuccess = () => {
            db.close();
            resolve(request.result);
          };
          request.onerror = () => reject(request.error);
        };
      }),
  );
  expect(stored).toEqual(draft);
});

test("a discovery request failure stays within the carousel and can be retried without reloading", async ({
  page,
}) => {
  await page.addInitScript(() =>
    sessionStorage.setItem("fixture:fail-discovery", "true"),
  );
  await page.goto("https://discovery.fixture/");
  await expect(
    region(page).getByText("Recipe suggestions are unavailable right now."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Leave Home" })).toBeVisible();
  await page.evaluate(() => {
    sessionStorage.removeItem("fixture:fail-discovery");
    document.body.dataset.retryMarker = "retained";
  });
  await region(page).getByRole("button", { name: "Try again" }).tap();
  await expect(region(page).getByRole("listitem")).toHaveCount(6);
  expect(await page.locator("body").getAttribute("data-retry-marker")).toBe(
    "retained",
  );
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("fixture:discovery-requests"),
    ),
  ).toBe("2");
});

test("switching spaces while discovery is loading cannot show the previous space's response", async ({
  page,
}) => {
  await page.addInitScript(() =>
    sessionStorage.setItem("fixture:delay-discovery", "true"),
  );
  await page.goto("https://discovery.fixture/");
  await expect
    .poll(() =>
      page.evaluate(() => sessionStorage.getItem("fixture:discovery-requests")),
    )
    .toBe("1");
  await page.getByRole("button", { name: "Private space" }).tap();
  await expect(region(page).getByRole("listitem")).toHaveCount(6);
  expect(await destinations(page)).not.toContain("/recipes/view?slug=meal-3");
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("fixture:discovery-requests"),
    ),
  ).toBe("2");
});
