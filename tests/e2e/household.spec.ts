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
      else
        await route.fulfill({
          contentType: "text/html",
          body: '<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/app.css"><style>:root{--font-dm-sans:Arial;--font-fraunces:Georgia}</style></head><body><div id="root"></div><script src="/app.js"></script></body></html>',
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
    page.getByRole("heading", { name: "Review your new week", exact: true }),
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
      page.getByRole("heading", { name: "Review your new week", exact: true }),
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
