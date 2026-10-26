import { expect, test } from "@playwright/test";
import { build } from "vite";
import path from "node:path";
import { readFileSync, readdirSync } from "node:fs";
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
  const fixture = path.resolve("tests/browser-fixtures/household");
  const result = await build({
    configFile: false,
    logLevel: "error",
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    resolve: {
      alias: {
        "@/features/auth/use-foodedo-auth": path.join(fixture, "auth.ts"),
        "@": path.resolve("src"),
        "next/navigation": path.join(fixture, "navigation.ts"),
        "convex/react": path.join(fixture, "convex.ts"),
        "@clerk/react": path.join(fixture, "clerk.tsx"),
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
        name: "HouseholdFixture",
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
    /^https?:\/\/(household\.fixture|localhost:4317)\//,
    async (route) => {
      if (new URL(route.request().url()).pathname === "/app.js")
        await route.fulfill({
          contentType: "application/javascript",
          body: javascript,
        });
      else if (new URL(route.request().url()).pathname === "/app.css")
        await route.fulfill({ contentType: "text/css", body: stylesheet });
      else if (new URL(route.request().url()).pathname.startsWith("/images/"))
        await route.fulfill({
          path: path.resolve(
            "public",
            new URL(route.request().url()).pathname.slice(1),
          ),
        });
      else if (
        new URL(route.request().url()).pathname.startsWith(
          "/_next/static/media/",
        )
      )
        await route.fulfill({
          path: path.resolve(
            ".next/static/media",
            path.basename(new URL(route.request().url()).pathname),
          ),
        });
      else
        await route.fulfill({
          contentType: "text/html",
          body: '<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/app.css"><style>:root{--font-dm-sans:"DM Sans",Arial;--font-fraunces:Fraunces,Georgia}body{font-family:var(--font-dm-sans)}</style></head><body><div id="root"></div><script src="/app.js"></script></body></html>',
        });
    },
  );
});

test("joining survives the membership remount, opens Our week and lets the logo open Home", async ({
  page,
}) => {
  await page.goto("https://household.fixture/household/join?token=invitation");
  await page
    .getByRole("button", { name: "Join household", exact: true })
    .click();
  await expect(page).toHaveURL("https://household.fixture/week");
  await expect(
    page.getByRole("heading", { name: "Our week", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("You’re in. Welcome to your household."),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("foodedo:pending-household-invite"),
    ),
  ).toBeNull();
  await page.getByRole("link", { name: "Foodedo", exact: true }).click();
  await expect(page).toHaveURL("https://household.fixture/");
  await expect(
    page.getByRole("link", { name: "Import a recipe into Foodedo" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "You’re already here." }),
  ).toHaveCount(0);
});

test("starting next week uses household favourites before usual settings have been saved", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2030-11-01T12:00:00.001Z"));
  await page.addInitScript(() =>
    sessionStorage.setItem("fixture:selection-signals", "enabled"),
  );
  await page.goto("https://household.fixture/week?screen=week-page");
  await page.getByRole("button", { name: /Start next plan/ }).click();
  await expect(
    page.getByRole("heading", { name: "Plan your next week", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Plan our week", exact: true })
    .click();
  await expect(page).toHaveURL("https://household.fixture/week/new");
  const firstMeal = await page.evaluate(
    () =>
      new Promise<string | null>((resolve, reject) => {
        const open = indexedDB.open("foodedo");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const database = open.result;
          const request = database
            .transaction("guest-drafts", "readonly")
            .objectStore("guest-drafts")
            .getAll();
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            database.close();
            resolve(request.result[0]?.mealChoices[0]?.catalogueMealId ?? null);
          };
        };
      }),
  );
  expect(firstMeal).toBe("family-meal");
});

test("next-plan settings stay temporary unless future defaults are explicitly chosen", async ({
  page,
}) => {
  await page.goto("https://household.fixture/week/setup?mode=next");
  await expect(
    page.getByRole("heading", { name: "Plan your next week", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "5 days", exact: true }).click();
  await page.getByRole("button", { name: "Choose date", exact: true }).click();
  await page.getByLabel("Choose plan start date").fill("2030-11-04");
  await expect(
    page.getByRole("radio", { name: /This plan only/ }),
  ).toBeChecked();
  expect(
    await page.evaluate(() => sessionStorage.getItem("fixture:usual-update")),
  ).toBeNull();
  await page.getByRole("radio", { name: /This and future plans/ }).check();
  await page
    .getByRole("button", { name: "Plan our week", exact: true })
    .click();
  await expect(page).toHaveURL("https://household.fixture/week/new");
  expect(
    await page.evaluate(() =>
      JSON.parse(sessionStorage.getItem("fixture:usual-update")!),
    ),
  ).toEqual({ usualPlanDays: 5 });
});

test("replan immediately generates with the existing settings without a setup step", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2030-11-01T12:00:00.001Z"));
  await page.goto("https://household.fixture/week?screen=week-page");
  await page
    .getByRole("button", { name: "Replan this week", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Review your new meals", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Replan this week", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Replan this week", exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("fixture:proposal-requested"),
    ),
  ).toBe("true");
});

for (const width of [320, 390, 1280]) {
  test(`replan review shows meal imagery and fits at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await page.clock.setFixedTime(new Date("2030-11-01T12:00:00.001Z"));
    await page.addInitScript(() =>
      sessionStorage.setItem("fixture:review-images", "true"),
    );
    await page.route("**/images/recipes/fish-tacos.webp", (route) =>
      route.fulfill({
        path: path.resolve("public/images/recipes/fish-tacos.webp"),
        contentType: "image/webp",
      }),
    );
    await page.goto("https://household.fixture/week?screen=week-page");
    await page
      .getByRole("button", { name: "Replan this week", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Review your new meals", exact: true }),
    ).toBeVisible();
    const image = page.locator("main li img").first();
    await expect(image).toBeVisible();
    await expect
      .poll(() =>
        image.evaluate((element) => (element as HTMLImageElement).naturalWidth),
      )
      .toBeGreaterThan(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await expect(
      page.getByRole("button", { name: "Replace shared week", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Keep current week", exact: true }),
    ).toHaveAttribute("href", "/week");
    await page.screenshot({
      path: testInfo.outputPath(`replan-review-${width}.png`),
      fullPage: true,
    });
  });
}

test("an existing member can leave an old invite through the logo without getting redirected back", async ({
  page,
}) => {
  await page.addInitScript(() => {
    sessionStorage.setItem("fixture:joined", "true");
    if (location.pathname === "/household/join")
      localStorage.setItem(
        "foodedo:pending-household-invite",
        "old-invitation",
      );
  });
  await page.goto(
    "https://household.fixture/household/join?token=old-invitation",
  );
  await expect(
    page.getByRole("heading", { name: "You’re already here." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Foodedo", exact: true }).click();
  await expect(page).toHaveURL("https://household.fixture/");
  await expect(
    page.getByRole("link", { name: "Import a recipe into Foodedo" }),
  ).toBeVisible();
});

test("sign-in resumes an invitation once without trapping subsequent navigation", async ({
  page,
}) => {
  await page.goto(
    "https://household.fixture/household/join?token=invitation&role=guest",
  );
  await expect(
    page.getByRole("button", { name: "Sign in to continue" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("foodedo:pending-household-invite"),
    ),
  ).toBe("invitation");
  // Model Clerk returning to Home after sign-in with the saved invitation.
  await page.goto("https://household.fixture/");
  await expect(page).toHaveURL(
    "https://household.fixture/household/join?token=invitation",
  );
  await expect(
    page.getByRole("button", { name: "Join household", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("foodedo:pending-household-invite"),
    ),
  ).toBeNull();
  await page.getByRole("link", { name: "Foodedo", exact: true }).click();
  await expect(page).toHaveURL("https://household.fixture/");
  await expect(
    page.getByRole("link", { name: "Import a recipe into Foodedo" }),
  ).toBeVisible();
});

test("switches independent weeks and shopping contexts and remembers Private after reload", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("https://household.fixture/");
  await expect(page.getByRole("heading", { name: "Our week" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "View Family tomato pasta recipe" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Plan and shop for Household" })
    .click();
  await page
    .getByRole("button", { name: "Private Your own meals and shopping" })
    .click();
  await expect(page.getByRole("heading", { name: "My week" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "View Private work-trip dinner recipe" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "View Family tomato pasta recipe" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Shop tab", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: "Cauliflower" }),
  ).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Parsley" })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "My week" })).toBeVisible();
});

test("context selection follows another tab after making a local selection", async ({
  page,
}) => {
  await page.goto("https://household.fixture/");
  await page
    .getByRole("button", { name: "Plan and shop for Household" })
    .click();
  await page
    .getByRole("button", { name: "Private Your own meals and shopping" })
    .click();
  await expect(
    page.getByRole("heading", { name: "My week", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    const key = "foodedo:space:fixture-alice:household-one";
    localStorage.setItem(key, "household");
    window.dispatchEvent(
      new StorageEvent("storage", {
        key,
        newValue: "household",
        storageArea: localStorage,
      }),
    );
  });
  await expect(
    page.getByRole("heading", { name: "Our week", exact: true }),
  ).toBeVisible();
});

test("the adjustment form keeps its reviewed baseline when a partner changes servings", async ({
  page,
}) => {
  await page.goto("https://household.fixture/");
  await page
    .getByRole("button", { name: "Edit this week", exact: true })
    .click();
  await page.getByRole("button", { name: "Decrease servings" }).click();
  await expect(
    page.getByRole("button", { name: "Reset", exact: true }),
  ).toBeEnabled();
  await page.evaluate(() => {
    sessionStorage.setItem("fixture:servings", "3");
    sessionStorage.setItem("fixture:plan-revision", "2");
    window.dispatchEvent(new Event("fixture:plan-change"));
  });
  await expect(
    page.getByRole("button", { name: "Reset", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "4" })).toBeVisible();
});

test("a signed-out replan link avoids authenticated queries and returns to Week", async ({
  page,
}) => {
  await page.goto("https://household.fixture/?screen=replan&role=guest");
  await expect(
    page.getByRole("heading", { name: "Open your week first" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Go to Week" })).toHaveAttribute(
    "href",
    "/week",
  );
});

test("opening a different authenticated invitation clears an older continuation", async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (location.pathname === "/household/join")
      localStorage.setItem(
        "foodedo:pending-household-invite",
        "older-invitation",
      );
  });
  await page.goto(
    "https://household.fixture/household/join?token=new-invitation",
  );
  await expect(
    page.getByRole("button", { name: "Join household", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("foodedo:pending-household-invite"),
    ),
  ).toBeNull();
  await page.getByRole("link", { name: "Foodedo", exact: true }).click();
  await expect(page).toHaveURL("https://household.fixture/");
});

test("shopping removal discloses household impact and Undo retains its original context", async ({
  page,
}) => {
  await page.goto("https://household.fixture/");
  await page.getByRole("button", { name: "Shop tab", exact: true }).click();
  await page.getByRole("button", { name: "View details for Parsley" }).click();
  await expect(page.getByText("Family tomato pasta")).toBeVisible();
  await expect(
    page.getByText("Removes it for everyone. You can undo."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Remove from list" }).click();
  await expect(
    page.getByText("Parsley removed · Household", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Plan and shop for Household" })
    .click();
  await page
    .getByRole("button", { name: "Private Your own meals and shopping" })
    .click();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: "Cauliflower" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Plan and shop for Private" }).click();
  await page
    .getByRole("button", { name: "Household Shared meals and shopping" })
    .click();
  await expect(page.getByRole("checkbox", { name: "Parsley" })).toBeVisible();
});

for (const width of [320, 390, 1280])
  test(`household week and selector fit a ${width}px viewport`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("https://household.fixture/");
    if (width === 390)
      await page.screenshot({
        path: test.info().outputPath("household-week.png"),
        fullPage: true,
      });
    await page
      .getByRole("button", { name: "Plan and shop for Household" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Plan and shop for" }),
    ).toBeVisible();
    if (width === 390)
      await page.evaluate(async () => {
        await Promise.all(
          document.getAnimations().map((animation) => animation.finished),
        );
      });
    if (width === 390)
      await page.screenshot({
        path: test.info().outputPath("household-selector.png"),
        fullPage: true,
      });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });

for (const width of [320, 390, 1280])
  test(`Week and Shopping header controls fit both contexts at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("https://household.fixture/");
    for (const context of ["Household", "Private"] as const) {
      if (context === "Private") {
        await page
          .getByRole("button", { name: "Plan and shop for Household" })
          .click();
        await page
          .getByRole("button", { name: "Private Your own meals and shopping" })
          .click();
      }
      for (const screen of ["week", "shop"] as const) {
        await page
          .getByRole("button", {
            name: screen === "week" ? "Week tab" : "Shop tab",
            exact: true,
          })
          .click();
        const title = page.getByRole("heading", {
          name:
            screen === "week"
              ? context === "Household"
                ? "Our week"
                : "My week"
              : context === "Household"
                ? "Our shopping"
                : "My shopping",
          exact: true,
        });
        await expect(title).toBeVisible();
        const header = title.locator("..");
        const selector = header.getByRole("button", {
          name: `Plan and shop for ${context}`,
        });
        const action =
          screen === "week"
            ? header.getByRole("button", {
                name: "Edit this week",
                exact: true,
              })
            : header.getByRole("link", { name: "View week", exact: true });
        const titleBox = (await title.boundingBox())!;
        const selectorBox = (await selector.boundingBox())!;
        const actionBox = (await action.boundingBox())!;
        const summaryBox = (await header
          .locator(`#${await title.getAttribute("aria-describedby")}`)
          .boundingBox())!;
        expect(selectorBox.width).toBe(120);
        expect(selectorBox.height).toBeGreaterThanOrEqual(44);
        expect(actionBox.height).toBeGreaterThanOrEqual(44);
        if (width === 320) {
          expect(selectorBox.y).toBeGreaterThanOrEqual(
            summaryBox.y + summaryBox.height,
          );
          expect(Math.abs(selectorBox.y - actionBox.y)).toBeLessThan(1);
        } else {
          expect(Math.abs(selectorBox.y - titleBox.y)).toBeLessThan(1);
          expect(actionBox.y).toBeGreaterThanOrEqual(
            titleBox.y + titleBox.height,
          );
        }
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await header.screenshot({
          path: test.info().outputPath(`${screen}-${context}-${width}.png`),
        });
        if (screen === "week") {
          await action.click();
          await expect(
            page.getByRole("heading", { name: "Edit this saved week" }),
          ).toBeVisible();
          await page
            .getByRole("button", { name: "Close adjustments", exact: true })
            .click();
          await expect(
            page.getByRole("heading", { name: "Edit this saved week" }),
          ).toBeHidden();
        }
      }
    }
  });

test("Home offers household creation once there is an active plan", async ({
  page,
}) => {
  await page.goto(
    "https://household.fixture/?screen=dashboard&members=none&plan=active",
  );
  await expect(
    page.getByRole("link", { name: "Create a household", exact: true }),
  ).toHaveAttribute("href", "/household");
});

test("Home prioritises the planning introduction before a first plan", async ({
  page,
}) => {
  await page.goto(
    "https://household.fixture/?screen=dashboard&members=none&plan=empty",
  );
  await expect(
    page.getByRole("complementary", { name: "Planning introduction" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Create a household", exact: true }),
  ).toHaveCount(0);
});

for (const condition of ["members=present", "members=loading", "role=guest"])
  test(`Home hides household discovery for ${condition}`, async ({ page }) => {
    await page.goto(`https://household.fixture/?screen=dashboard&${condition}`);
    await expect(
      page.getByRole("heading", { name: "Share your week", exact: true }),
    ).toHaveCount(0);
  });

test("household loading stays within the desktop page container", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(
    "https://household.fixture/?screen=household&members=loading",
  );
  const loading = page
    .getByRole("main")
    .filter({ hasText: "Loading your household…" });
  await expect(loading).toBeVisible();
  const bounds = await loading.boundingBox();
  expect(bounds?.width).toBe(700);
  expect(bounds?.x).toBe(290);
});

test("local web invitations retain localhost and its port when displayed and copied", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: "http://localhost:4317",
  });
  await page.goto("http://localhost:4317/?screen=invite");
  const url = `http://localhost:4317/household/join?token=${"a".repeat(64)}`;
  await expect(page.getByText(url, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Copy link", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(url);
});

test("the shopping introduction stays readable and does not repeat on reload", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("https://household.fixture/?screen=saved&introduction=first");
  const introduction = page.getByRole("region", {
    name: "Your shopping list is ready",
  });
  await expect(introduction).toBeVisible();
  await expect(page.getByText(/1 planned dinner/)).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() =>
        JSON.parse(
          sessionStorage.getItem("fixture:retired:fixture-alice") ?? "[]",
        ).includes("shopping"),
      ),
    )
    .toBe(true);
  await expect(introduction).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open shopping list" }),
  ).toHaveAttribute("href", "/shop");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Your plan is saved" }),
  ).toBeVisible();
  await expect(introduction).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Go to my week" }),
  ).toHaveAttribute("href", "/week");
});

test("a solo household can keep planning in its own space", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("https://household.fixture/?screen=household&members=solo");
  await expect(
    page.getByRole("heading", { name: "Ready to share.", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("You can keep planning on your own until someone joins."),
  ).toBeVisible();
  await page.getByRole("link", { name: "View my week" }).click();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("foodedo:space:fixture-alice:household-one"),
    ),
  ).toBe("household");
});

test("an offline dismissal stays hidden and syncs when the connection returns", async ({
  page,
}) => {
  await page.goto(
    "https://household.fixture/?screen=dashboard&members=none&plan=empty",
  );
  const hint = page.getByRole("complementary", {
    name: "Planning introduction",
  });
  await expect(hint).toBeVisible();
  await page.evaluate(() =>
    sessionStorage.setItem("fixture:fail-onboarding-once", "true"),
  );
  await page
    .getByRole("button", { name: "Dismiss planning introduction" })
    .click();
  await expect(hint).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() => sessionStorage.getItem("fixture:onboarding-syncs")),
    )
    .toBe("1");
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("fixture:retired:fixture-alice"),
    ),
  ).toBeNull();
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect
    .poll(() =>
      page.evaluate(() =>
        JSON.parse(
          sessionStorage.getItem("fixture:retired:fixture-alice") ?? "[]",
        ),
      ),
    )
    .toContain("home");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Dinner, decided." }),
  ).toBeVisible();
  await expect(hint).toHaveCount(0);
});

test("guest dismissals transfer once and do not leak into the next account", async ({
  page,
}) => {
  await page.goto(
    "https://household.fixture/?screen=dashboard&members=none&plan=empty&role=guest",
  );
  const hint = page.getByRole("complementary", {
    name: "Planning introduction",
  });
  await expect(hint).toBeVisible();
  await page
    .getByRole("button", { name: "Dismiss planning introduction" })
    .click();
  await page.evaluate(() => {
    sessionStorage.setItem("fixture:identity", "fixture-alice");
    window.dispatchEvent(new Event("fixture:auth-change"));
  });
  await expect
    .poll(() =>
      page.evaluate(() =>
        JSON.parse(
          sessionStorage.getItem("fixture:retired:fixture-alice") ?? "[]",
        ),
      ),
    )
    .toContain("home");
  await expect(hint).toHaveCount(0);
  await page.evaluate(() => {
    sessionStorage.setItem("fixture:identity", "guest");
    window.dispatchEvent(new Event("fixture:auth-change"));
  });
  await expect(hint).toHaveCount(0);
  await page.evaluate(() => {
    sessionStorage.setItem("fixture:identity", "fixture-bob");
    window.dispatchEvent(new Event("fixture:auth-change"));
  });
  await expect(hint).toBeVisible();
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("fixture:retired:fixture-bob"),
    ),
  ).toBeNull();
});

for (const now of ["2030-10-20", "2030-11-01", "2030-11-02", "2030-12-01"]) {
  test(`plan meals stay editable and visible at ${now}`, async ({ page }) => {
    await page.clock.setFixedTime(new Date(`${now}T12:00:00Z`));
    await page.goto("https://household.fixture/?screen=week");
    await expect(
      page.getByRole("button", { name: "Actions for Family tomato pasta" }),
    ).toBeVisible();
    await expect(
      page.getByText("1 planned dinner", { exact: false }),
    ).toBeVisible();
    await expect(
      page.locator("main li").getByText(/FRI|SAT|SUN/, { exact: true }),
    ).toHaveCount(0);
    await page.goto(
      "https://household.fixture/?screen=dashboard&meals=multiple",
    );
    await expect(
      page.getByRole("heading", { name: "What sounds good?", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Family tomato pasta", exact: true }),
    ).toBeVisible();
    const carousel = page.getByRole("region", {
      name: "Meals in your plan",
      exact: true,
    });
    await expect(
      carousel.getByRole("button", {
        name: "Another plan dinner",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      carousel.getByRole("button", {
        name: "Family tomato pasta",
        exact: true,
      }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      carousel.getByRole("link", { name: "View plan" }),
    ).toHaveAttribute("href", "/week");
    await page.clock.setFixedTime(
      new Date(new Date(`${now}T12:00:00Z`).getTime() + 86_400_000),
    );
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Family tomato pasta", exact: true }),
    ).toBeVisible();
  });
}

test("dashboard skips unavailable recipes without removing the plan slot", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2030-12-01T12:00:00Z"));
  await page.goto(
    "https://household.fixture/?screen=dashboard&meals=multiple&unavailable=first",
  );
  await expect(
    page.getByRole("heading", { name: "Another plan dinner", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Built from 2 planned meals")).toBeVisible();
});

for (const space of ["household", "private"]) {
  test(`recipe planner edits an elapsed ${space} plan without date choices`, async ({
    page,
  }) => {
    await page.clock.setFixedTime(new Date("2030-12-01T12:00:00Z"));
    if (space === "private")
      await page.addInitScript(() =>
        localStorage.setItem(
          "foodedo:space:fixture-alice:household-one",
          "private",
        ),
      );
    await page.goto("https://household.fixture/?screen=planner");
    await page
      .getByRole("button", { name: "Plan this meal", exact: true })
      .click();
    const planner = page.getByRole("dialog", { name: "Plan this meal" });
    await expect(planner).toBeVisible();
    await expect(
      planner.getByText(/Friday|Saturday|Sunday|2030|November/),
    ).toHaveCount(0);
    await expect(
      planner.getByRole("button", { name: "Add a meal", exact: true }),
    ).toHaveCount(2);
    await planner
      .getByRole("button", { name: "Add a meal", exact: true })
      .first()
      .click();
    await expect(planner).toBeHidden();
    const planned = await page.evaluate(() =>
      JSON.parse(sessionStorage.getItem("fixture:planned-meal")!),
    );
    expect(planned.householdId).toBe(
      space === "household" ? "household-one" : undefined,
    );
    expect(planned).toMatchObject({
      date: "2030-11-02",
      catalogueMealId: "private-meal",
    });
  });
}

test("elapsed plan and its date-free recipe picker fit on mobile", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.setFixedTime(new Date("2030-12-01T12:00:00Z"));
  await page.goto("https://household.fixture/?screen=week");
  await expect(
    page.getByRole("button", { name: /Start next plan/ }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("flexible-plan-mobile.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Actions for Family tomato pasta" })
    .click();
  await page.getByRole("button", { name: /^Choose a recipe/ }).click();
  await expect(
    page.getByRole("heading", { name: "Swap this meal", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.getByRole("dialog").evaluate(async (element) => {
    await Promise.all(
      element
        .getAnimations({ subtree: true })
        .map((animation) => animation.finished.catch(() => {})),
    );
  });
  await page.screenshot({
    path: testInfo.outputPath("flexible-picker-mobile.png"),
    fullPage: true,
  });
});

test("shopping sources show the recipe without assigning a weekday", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2030-12-01T12:00:00Z"));
  await page.goto("https://household.fixture/?screen=shop");
  await page.getByRole("button", { name: "View details for Parsley" }).click();
  const sources = page.getByRole("dialog", { name: "Parsley", exact: true });
  await expect(
    sources.getByText("Family tomato pasta", { exact: true }),
  ).toBeVisible();
  await expect(sources.getByText(/Friday|Saturday|Sunday/)).toHaveCount(0);
});

test("archived plans retain meals and date ranges without offering edits", async ({
  page,
}) => {
  await page.goto("https://household.fixture/?screen=week&archived=true");
  await expect(
    page.getByText("1 Nov–3 Nov · archived", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "View Family tomato pasta recipe" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /^Actions for / })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", { name: "Add meal", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Empty slot", { exact: true }).first(),
  ).toBeVisible();
});

test.describe("Home meal selector", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const first = "Creamy Beef Stroganoff with Mushrooms";
  const second = "Crispy Fish Tacos with Crunchy Lime Slaw";
  const fourth =
    "Pan-Fried Mackerel with Lemon, Fresh Herbs and Buttered New Potatoes";
  const selector = (page: import("@playwright/test").Page) =>
    page.getByRole("region", { name: "Meals in your plan", exact: true });

  test("real titles, both links and metadata update as one selection", async ({
    page,
  }, testInfo) => {
    await page.goto("https://household.fixture/?screen=dashboard&selector=4");
    const region = selector(page);
    await expect(
      region.getByRole("heading", { name: first, exact: true }),
    ).toBeVisible();
    await expect(
      region.getByRole("button", { name: "Previous meal", exact: true }),
    ).toBeDisabled();
    await expect(
      region.getByRole("button", { name: first, exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await region.getByRole("button", { name: second, exact: true }).click();
    await expect(
      region.getByRole("heading", { name: second, exact: true }),
    ).toBeVisible();
    await expect(region.getByText("26 min", { exact: true })).toBeVisible();
    await expect(region.getByText("Serves 4", { exact: true })).toBeVisible();
    await expect(
      region.getByRole("link", { name: "Cook this meal", exact: true }),
    ).toHaveAttribute(
      "href",
      /recipeId=shared-selector-recipe-1&servings=4&planServings=4$/,
    );
    await expect(
      region.getByRole("link", { name: "View recipe", exact: true }),
    ).toHaveAttribute(
      "href",
      /\/recipes\/view\?recipeId=shared-selector-recipe-1&servings=4&planServings=4$/,
    );
    await expect(region.getByRole("button", { pressed: true })).toHaveCount(1);
    await expect(
      page.getByText("Shopping list ready", { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("meal-selector-default-mobile.png"),
      fullPage: true,
    });
  });

  test("one meal and missing metadata have no empty carousel controls", async ({
    page,
  }) => {
    await page.goto(
      "https://household.fixture/?screen=dashboard&selector=1&description=missing&images=missing&timing=missing",
    );
    const region = selector(page);
    await expect(
      region.getByRole("heading", { name: first, exact: true }),
    ).toBeVisible();
    await expect(region.getByRole("button")).toHaveCount(0);
    await expect(region.getByRole("list")).toHaveCount(0);
    await expect(region.getByRole("img")).toHaveCount(0);
    await expect(region.getByText("Serves 4", { exact: true })).toBeVisible();
    await expect(
      region.getByRole("link", { name: "Cook this meal", exact: true }),
    ).toBeVisible();
    await expect(
      region.getByRole("link", { name: "View recipe", exact: true }),
    ).toBeVisible();
  });

  test("two meals keep full titles and catalogue references", async ({
    page,
  }) => {
    await page.goto(
      "https://household.fixture/?screen=dashboard&selector=2&source=catalogue",
    );
    const region = selector(page);
    await expect(region.getByRole("listitem")).toHaveCount(2);
    await region
      .getByRole("button", { name: "Next meal", exact: true })
      .click();
    await expect(
      region.getByRole("heading", { name: second, exact: true }),
    ).toBeVisible();
    await expect(
      region.getByRole("button", { name: "Next meal", exact: true }),
    ).toBeDisabled();
    await expect(
      region.getByRole("link", { name: "View recipe", exact: true }),
    ).toHaveAttribute(
      "href",
      /slug=selector-meal-1&servings=4&catalogueMealId=selector-meal-1&catalogueVersion=2$/,
    );
    await expect(
      region.getByRole("link", { name: "Cook this meal", exact: true }),
    ).toHaveAttribute(
      "href",
      /slug=selector-meal-1&servings=4&catalogueMealId=selector-meal-1&catalogueVersion=2$/,
    );
  });

  test("long plans scroll thumbnails without changing selection and keep the selected item visible", async ({
    page,
  }, testInfo) => {
    await page.goto(
      "https://household.fixture/?screen=dashboard&selector=8&description=long",
    );
    const region = selector(page);
    const strip = region.getByRole("list", { name: "Choose a planned meal" });
    expect(
      await strip.evaluate((node) => node.scrollWidth > node.clientWidth),
    ).toBe(true);
    await strip.evaluate((node) => {
      node.scrollLeft = 400;
    });
    await expect(
      region.getByRole("heading", { name: first, exact: true }),
    ).toBeVisible();
    const photo = region.locator('[aria-label="Meal photographs"]');
    await photo.focus();
    await photo.press("End");
    await expect(
      region.getByRole("heading", { name: fourth, exact: true }),
    ).toBeVisible();
    await expect(
      region.getByRole("button", { name: "Next meal", exact: true }),
    ).toBeDisabled();
    const selected = region.getByRole("button", { pressed: true });
    const viewport = await strip.boundingBox();
    await expect
      .poll(async () => {
        const bounds = await selected.boundingBox();
        return (
          bounds!.x >= viewport!.x - 1 &&
          bounds!.x + bounds!.width <= viewport!.x + viewport!.width + 1
        );
      })
      .toBe(true);
    expect(
      await selected
        .locator("span")
        .last()
        .evaluate((element) => element.getBoundingClientRect().height),
    ).toBeLessThanOrEqual(36);
    const description = region.getByText(/^Tender, golden ingredients/);
    expect(
      await description.evaluate(
        (element) => element.getBoundingClientRect().height,
      ),
    ).toBeLessThanOrEqual(40);
    await page.screenshot({
      path: testInfo.outputPath("meal-selector-long-plan-mobile.png"),
      fullPage: true,
    });
  });

  test("thumbnail keyboard choices and photo swiping are consistent", async ({
    page,
  }) => {
    await page.goto("https://household.fixture/?screen=dashboard&selector=4");
    const region = selector(page);
    const photo = region.locator('[aria-label="Meal photographs"]');
    await expect(photo.locator(":scope > div")).toHaveAttribute(
      "style",
      /transform/,
    );
    const box = await photo.boundingBox();
    const session = await page.context().newCDPSession(page);
    const x = box!.x + box!.width * 0.8,
      y = box!.y + box!.height * 0.3;
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y }],
    });
    for (let step = 1; step <= 8; step++)
      await session.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: x - step * box!.width * 0.09, y }],
      });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await session.detach();
    await expect(
      region.getByRole("heading", { name: first, exact: true }),
    ).toHaveCount(0);
    await photo.press("Home");
    const firstThumb = region.getByRole("button", { name: first, exact: true });
    await firstThumb.focus();
    await firstThumb.press("ArrowRight");
    await expect(
      region.getByRole("button", { name: second, exact: true }),
    ).toBeFocused();
    await expect(
      region.getByRole("heading", { name: second, exact: true }),
    ).toBeVisible();
  });

  test("mobile thumbnails bleed to the edges and bring choices forward without scrolling the page", async ({
    page,
  }, testInfo) => {
    await page.goto("https://household.fixture/?screen=dashboard&selector=8");
    const region = selector(page);
    const strip = region.getByRole("list", { name: "Choose a planned meal" });
    const bounds = await strip.boundingBox();
    expect(bounds!.x).toBe(0);
    expect(bounds!.width).toBe(390);
    const initialPageY = await page.evaluate(() => scrollY);
    const thumbnails = strip.getByRole("button");
    for (const index of [2, 3]) {
      await thumbnails.nth(index).click();
      await expect(thumbnails.nth(index)).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await expect
        .poll(async () => (await thumbnails.nth(index).boundingBox())!.x)
        .toBeCloseTo(20, 0);
      expect(await page.evaluate(() => scrollY)).toBe(initialPageY);
    }
    await page.screenshot({
      path: testInfo.outputPath("meal-selector-edge-bleed-mobile.png"),
      fullPage: true,
    });
    await region.getByRole("group", { name: "Meal photographs" }).press("End");
    await expect
      .poll(() =>
        strip.evaluate(
          (node) => node.scrollWidth - node.clientWidth - node.scrollLeft,
        ),
      )
      .toBeLessThan(1);
    // At the end, keep the last few meals together instead of adding empty space.
    expect((await thumbnails.last().boundingBox())!.x).toBeGreaterThan(20);
  });

  test("photo arrows slide between meals and respect reduced motion", async ({
    page,
  }) => {
    await page.goto("https://household.fixture/?screen=dashboard&selector=4");
    const region = selector(page);
    const photo = region.getByRole("group", { name: "Meal photographs" });
    await expect(photo.locator(":scope > div")).toHaveAttribute(
      "style",
      /transform/,
    );
    const next = region.getByRole("button", { name: "Next meal", exact: true });
    const movement = await next.evaluate(async (button) => {
      const photo = document.querySelector('[aria-label="Meal photographs"]')!;
      const slide = photo.firstElementChild!.firstElementChild!;
      const start = slide.getBoundingClientRect().left;
      (button as HTMLButtonElement).click();
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      return {
        distance: start - slide.getBoundingClientRect().left,
        width: photo.clientWidth,
      };
    });
    expect(movement.distance).toBeGreaterThan(0);
    expect(movement.distance).toBeLessThan(movement.width);
    await expect(
      region.getByRole("heading", { name: second, exact: true }),
    ).toBeVisible();
    await expect
      .poll(() =>
        photo
          .locator(":scope > div > div")
          .nth(1)
          .evaluate((node) =>
            Math.abs(
              node.getBoundingClientRect().left -
                node.parentElement!.parentElement!.getBoundingClientRect().left,
            ),
          ),
      )
      .toBeLessThan(1);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await next.click();
    // Embla applies even a jump on its next render frame.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    const offset = await photo
      .locator(":scope > div > div")
      .nth(2)
      .evaluate((node) =>
        Math.abs(
          node.getBoundingClientRect().left -
            node.parentElement!.parentElement!.getBoundingClientRect().left,
        ),
      );
    expect(offset).toBeLessThan(1);
  });

  test("explicit selection survives recipe and Cook Mode navigation, reload, and live plan edits", async ({
    page,
  }) => {
    await page.goto("https://household.fixture/?screen=dashboard&selector=4");
    const region = selector(page);
    await region.getByRole("button", { name: second, exact: true }).click();
    for (const action of ["View recipe", "Cook this meal"]) {
      await region.getByRole("link", { name: action, exact: true }).click();
      await page.goBack();
      await expect(
        selector(page).getByRole("heading", { name: second, exact: true }),
      ).toBeVisible();
      await expect(selector(page).getByRole("listitem")).toHaveCount(4);
    }
    await page.reload();
    await expect(
      region.getByRole("heading", { name: second, exact: true }),
    ).toBeVisible();
    await page.evaluate(() => {
      sessionStorage.setItem("fixture:rebase", "true");
      sessionStorage.setItem("fixture:servings", "6");
      sessionStorage.setItem("fixture:plan-revision", "2");
      dispatchEvent(new Event("fixture:plan-change"));
    });
    await expect(
      region.getByRole("heading", { name: second, exact: true }),
    ).toBeVisible();
    await expect(region.getByText("Serves 6", { exact: true })).toBeVisible();
    await page.evaluate(() => {
      sessionStorage.setItem("fixture:hide-slot", "1");
      dispatchEvent(new Event("fixture:plan-change"));
    });
    await expect(
      region.getByRole("heading", { name: first, exact: true }),
    ).toBeVisible();
    await page.evaluate(() => {
      sessionStorage.removeItem("fixture:hide-slot");
      dispatchEvent(new Event("fixture:plan-change"));
    });
    await expect(
      region.getByRole("heading", { name: first, exact: true }),
    ).toBeVisible();
  });

  test("choices stay scoped to the account, private/household space and plan", async ({
    page,
  }) => {
    await page.goto("https://household.fixture/?screen=dashboard&selector=4");
    const region = selector(page);
    await region.getByRole("button", { name: second, exact: true }).click();
    await page.evaluate(() => {
      localStorage.setItem(
        "foodedo:space:fixture-alice:household-one",
        "private",
      );
      dispatchEvent(new Event("storage"));
    });
    await expect(
      region.getByRole("button", { name: first, exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await region.getByRole("button", { name: fourth, exact: true }).click();
    await page.evaluate(() => {
      localStorage.setItem(
        "foodedo:space:fixture-alice:household-one",
        "household",
      );
      dispatchEvent(new Event("storage"));
    });
    await expect(
      region.getByRole("button", { name: second, exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.evaluate(() => {
      sessionStorage.setItem("fixture:new-plan", "replacement-plan");
      dispatchEvent(new Event("fixture:plan-change"));
    });
    await expect(
      region.getByRole("button", { name: first, exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  test("blocked session storage still permits selection and unavailable plans show recovery", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const originalGet = Storage.prototype.getItem;
      const originalSet = Storage.prototype.setItem;
      Storage.prototype.getItem = function (key) {
        if (key.startsWith("foodedo:home-meal:")) throw new Error("Blocked");
        return originalGet.call(this, key);
      };
      Storage.prototype.setItem = function (key, value) {
        if (key.startsWith("foodedo:home-meal:")) throw new Error("Blocked");
        originalSet.call(this, key, value);
      };
    });
    await page.goto("https://household.fixture/?screen=dashboard&selector=2");
    await selector(page)
      .getByRole("button", { name: "Next meal", exact: true })
      .click();
    await expect(
      selector(page).getByRole("heading", { name: second, exact: true }),
    ).toBeVisible();
    await page.goto(
      "https://household.fixture/?screen=dashboard&selector=2&unavailable=all",
    );
    await expect(selector(page)).toHaveCount(0);
    await expect(
      page.getByText("Your plan’s recipes are unavailable", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Built from 2 planned meals", { exact: true }),
    ).toBeVisible();
  });

  for (const width of [320, 390, 1280]) {
    test(`selector fits at ${width}px without shrinking full titles`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto("https://household.fixture/?screen=dashboard&selector=4");
      const region = selector(page);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      await expect(
        region.getByRole("heading", { name: first, exact: true }),
      ).toBeVisible();
      const primary = await region
        .getByRole("link", { name: "Cook this meal", exact: true })
        .boundingBox();
      const secondary = await region
        .getByRole("link", { name: "View recipe", exact: true })
        .boundingBox();
      expect(primary!.width).toBeGreaterThan(secondary!.width);
      expect(primary!.height).toBeGreaterThanOrEqual(44);
      expect(secondary!.height).toBeGreaterThanOrEqual(44);
      await page.screenshot({
        path: testInfo.outputPath(`meal-selector-${width}.png`),
        fullPage: true,
      });
    });
  }
});
