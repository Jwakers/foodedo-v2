import { expect, test } from "@playwright/test";
import { build } from "vite";
import path from "node:path";
import { readFileSync, readdirSync } from "node:fs";
let javascript = "";
let stylesheet = "";
test.beforeAll(async () => {
  const cssRoot = path.resolve(".next/static/css");
  stylesheet = readdirSync(cssRoot, { recursive: true })
    .filter((file) => String(file).endsWith(".css"))
    .map((file) => readFileSync(path.join(cssRoot, String(file)), "utf8"))
    .join("\n");
  const result = await build({
    configFile: false,
    logLevel: "error",
    define: {
      "process.env": JSON.stringify({
        NODE_ENV: "production",
        NEXT_PUBLIC_CAPACITOR_BUILD: "false",
      }),
    },
    resolve: {
      alias: {
        "@": path.resolve("src"),
        "next/navigation": path.resolve(
          "tests/browser-fixtures/household/navigation.ts",
        ),
        "next/image": path.resolve(
          "tests/browser-fixtures/catalogue-admin/next.tsx",
        ),
      },
    },
    build: {
      write: false,
      minify: false,
      lib: {
        entry: path.resolve(
          "tests/browser-fixtures/minimum-servings/entry.tsx",
        ),
        formats: ["iife"],
        name: "MinimumServingsFixture",
      },
    },
  });
  const bundle = Array.isArray(result) ? result[0] : result;
  if (!("output" in bundle)) throw new Error("Expected browser bundle");
  javascript = bundle.output
    .filter((item) => item.type === "chunk")
    .map((item) => item.code)
    .join("\n");
});
test.beforeEach(async ({ page }) => {
  page.on("pageerror", (error) =>
    console.error("Fixture error:", error.message),
  );
  await page.route("https://minimum.fixture/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    await route.fulfill(
      pathname === "/app.js"
        ? { contentType: "application/javascript", body: javascript }
        : pathname === "/app.css"
          ? { contentType: "text/css", body: stylesheet }
          : {
              contentType: "text/html",
              body: '<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>',
            },
    );
  });
});
test("recipe controls enforce the minimum and Cook agrees after refresh", async ({
  page,
}) => {
  await page.goto("https://minimum.fixture/recipes/view?servings=2");
  await expect(
    page.getByText("Makes 4 portions for 2 people. 2 portions left over."),
  ).toBeVisible();
  await expect(page.getByText(/400 g/)).toBeVisible();
  await page.getByRole("button", { name: /^Cook for 4/ }).click();
  await expect(
    page.getByRole("button", { name: "Decrease servings" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Increase servings" }).click();
  await expect(page.getByText(/500 g/)).toBeVisible();
  await expect(
    page.getByText("Makes 5 portions for 2 people. 3 portions left over."),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /Start cooking/i })
    .first()
    .click();
  await expect(page.getByText(/Mise en place · serves 5/)).toBeVisible();
  await expect(page.getByText(/500 g/)).toBeVisible();
  await page.reload();
  await expect(page.getByText(/Mise en place · serves 5/)).toBeVisible();
});
test("a direct Cook URL below the minimum uses the minimum quantities", async ({
  page,
}) => {
  await page.goto("https://minimum.fixture/recipes/cook?servings=1");
  await expect(page.getByText(/Mise en place · serves 4/)).toBeVisible();
  await expect(page.getByText(/400 g/)).toBeVisible();
});

declare global {
  interface Window {
    cookWakeLockTest: {
      requests: string[];
      releases: number;
      denied: boolean;
      deferred: boolean;
      resolve: () => void;
      visibility: (value: DocumentVisibilityState) => Promise<void>;
    };
  }
}

test.describe("Cook Mode screen wake lock", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const mode = new URLSearchParams(location.search).get("wakeLock");
      let visibility: DocumentVisibilityState = "visible";
      const sentinels: Sentinel[] = [];
      class Sentinel extends EventTarget {
        released = false;
        async release() {
          if (this.released) return;
          this.released = true;
          state.releases++;
          this.dispatchEvent(new Event("release"));
        }
      }
      const state = {
        requests: [] as string[],
        releases: 0,
        denied: mode === "denied",
        deferred: mode === "deferred",
        resolve: () => {},
        visibility: async (value: DocumentVisibilityState) => {
          visibility = value;
          if (value === "hidden") {
            await Promise.all(sentinels.map((lock) => lock.release()));
          }
          document.dispatchEvent(new Event("visibilitychange"));
        },
      };
      window.cookWakeLockTest = state;
      Object.defineProperty(document, "visibilityState", {
        get: () => visibility,
      });
      Object.defineProperty(navigator, "wakeLock", {
        configurable: true,
        value: {
          async request(type: string) {
            state.requests.push(type);
            if (state.denied) throw new Error("Power saving policy");
            const lock = new Sentinel();
            sentinels.push(lock);
            if (state.deferred) {
              await new Promise<void>((resolve) => {
                state.resolve = resolve;
              });
            }
            return lock;
          },
        },
      });
      if (mode === "unsupported") {
        Object.defineProperty(navigator, "wakeLock", { value: undefined });
      }
    });
  });

  test("keeps preparation, instructions and ingredients awake, resumes on return, and releases on completion", async ({
    page,
  }) => {
    await page.goto("https://minimum.fixture/recipes/cook?servings=4");
    await expect
      .poll(() => page.evaluate(() => window.cookWakeLockTest.requests))
      .toEqual(["screen"]);
    await page.getByRole("button", { name: /I’m ready/ }).click();
    await page.getByRole("button", { name: "Show ingredients" }).click();
    await page.getByRole("button", { name: "Back to cooking" }).click();
    await page.evaluate(async () => {
      await window.cookWakeLockTest.visibility("hidden");
      await window.cookWakeLockTest.visibility("visible");
      window.dispatchEvent(new Event("focus"));
      window.dispatchEvent(new Event("pageshow"));
    });
    await expect
      .poll(() => page.evaluate(() => window.cookWakeLockTest.requests))
      .toEqual(["screen", "screen"]);
    await page.getByRole("button", { name: /Dinner’s ready/ }).click();
    await expect
      .poll(() => page.evaluate(() => window.cookWakeLockTest.releases))
      .toBe(2);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    expect(
      await page.evaluate(() => window.cookWakeLockTest.requests.length),
    ).toBe(2);
  });

  test("releases a request that resolves after leaving Cook Mode", async ({
    page,
  }) => {
    await page.goto(
      "https://minimum.fixture/recipes/cook?servings=4&wakeLock=deferred",
    );
    await expect
      .poll(() => page.evaluate(() => window.cookWakeLockTest.requests.length))
      .toBe(1);
    await page.getByRole("button", { name: "Exit cook mode" }).click();
    await expect(page).toHaveURL(/\/recipes\/view/);
    await page.evaluate(() => window.cookWakeLockTest.resolve());
    await expect
      .poll(() => page.evaluate(() => window.cookWakeLockTest.releases))
      .toBe(1);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    expect(
      await page.evaluate(() => window.cookWakeLockTest.requests.length),
    ).toBe(1);
  });

  test("a denied lock does not break cooking and retries on interaction", async ({
    page,
  }) => {
    await page.goto(
      "https://minimum.fixture/recipes/cook?servings=4&wakeLock=denied",
    );
    await expect
      .poll(() => page.evaluate(() => window.cookWakeLockTest.requests.length))
      .toBe(1);
    await page.evaluate(() => {
      window.cookWakeLockTest.denied = false;
    });
    await page.getByRole("button", { name: /I’m ready/ }).click();
    await expect(page.getByText("Bake until cooked through.")).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => window.cookWakeLockTest.requests.length))
      .toBe(2);
    await page.getByRole("button", { name: "Exit cook mode" }).click();
    await expect
      .poll(() => page.evaluate(() => window.cookWakeLockTest.releases))
      .toBe(1);
  });

  test("cooking still works when the browser has no wake lock API", async ({
    page,
  }) => {
    await page.goto(
      "https://minimum.fixture/recipes/cook?servings=4&wakeLock=unsupported",
    );
    await page.getByRole("button", { name: /I’m ready/ }).click();
    await expect(page.getByText("Bake until cooked through.")).toBeVisible();
    await page.getByRole("button", { name: /Dinner’s ready/ }).click();
    expect(await page.evaluate(() => window.cookWakeLockTest.requests)).toEqual(
      [],
    );
  });
});
