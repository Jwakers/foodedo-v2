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
  const fixture = path.resolve("tests/browser-fixtures/catalogue-admin");
  const result = await build({
    configFile: false,
    logLevel: "error",
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    resolve: {
      alias: {
        "@": path.resolve("src"),
        "convex/react": path.join(fixture, "convex.ts"),
        "@clerk/react": path.join(fixture, "clerk.tsx"),
        "next/image": path.join(fixture, "next.tsx"),
        "next/link": path.join(fixture, "link.tsx"),
      },
    },
    build: {
      write: false,
      minify: false,
      lib: {
        entry: path.join(fixture, "entry.tsx"),
        formats: ["iife"],
        name: "EditorialFixture",
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
  await page.route("https://editorial.fixture/**", async (route) => {
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
  });
});
test("editorial UI supports generation, editing, culinary review and both approvals", async ({
  page,
}) => {
  await page.goto("https://editorial.fixture/");
  await page.getByRole("button", { name: "Trigger new recipe" }).click();
  await page.getByRole("button", { name: /^Lemon chickpea rice/ }).click();
  await expect(page.getByLabel("Title", { exact: true })).toBeHidden();
  await page.getByRole("button", { name: "Edit recipe", exact: true }).click();
  await page
    .getByLabel("Title", { exact: true })
    .fill("Lemon chickpea rice bowl");
  await expect(
    page.getByRole("button", { name: "Approve recipe and generate image" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(
    page.getByRole("button", { name: "Approve recipe and generate image" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Run culinary review" }).click();
  await page
    .getByRole("button", { name: "Approve recipe and generate image" })
    .click();
  await expect(
    page.getByRole("img", {
      name: "Generated photograph of Lemon chickpea rice bowl",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Approve image and publish" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Approve image and publish" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Recipe published to the catalogue.",
  );
  await expect(
    page.getByRole("button", { name: "Approve image and publish" }),
  ).toHaveCount(0);
});
test("ordinary accounts and guests do not see editorial controls", async ({
  page,
}) => {
  await page.goto("https://editorial.fixture/?role=ordinary");
  await expect(
    page.getByRole("heading", { name: "Administrator access required" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Trigger new recipe" }),
  ).toHaveCount(0);
  await page.goto("https://editorial.fixture/?role=guest");
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
});
test("served admin route recovers to sign-in for guests", async ({ page }) => {
  await page.goto("/admin/recipes");
  await expect(
    page.getByRole("heading", { name: "Recipe editorial" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Trigger new recipe" }),
  ).toHaveCount(0);
});

test("a typed recipe request is submitted and kept with the proposal", async ({
  page,
}) => {
  await page.goto("https://editorial.fixture/");
  await page
    .getByLabel("Recipe request (optional)")
    .fill("Can you generate me a rustic shepherd’s pie recipe?");
  await page.getByRole("button", { name: "Trigger new recipe" }).click();
  await page.getByRole("button", { name: /^Rustic shepherd’s pie/ }).click();
  await expect(page.getByText("Your recipe request:")).toBeVisible();
  await expect(
    page
      .getByRole("article")
      .getByText("Can you generate me a rustic shepherd’s pie recipe?", {
        exact: false,
      }),
  ).toBeVisible();
});
test("optional catalogue tags show an honest empty state, then allow reviewing suggestions", async ({
  page,
}) => {
  await page.goto("https://editorial.fixture/");
  await expect(
    page.getByRole("button", { name: "Catalogue analysis" }),
  ).toHaveCount(0);
  await page
    .getByText("Optional: improve catalogue suggestions", { exact: true })
    .click();
  await expect(
    page.getByText("No tag suggestions to review", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Accept selected/ }),
  ).toHaveCount(0);
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Suggest tags for 5 recipes" })
    .click();
  await page.getByRole("checkbox", { name: "Lemon chickpea rice" }).check();
  await page.getByRole("button", { name: "Accept selected tags (1)" }).click();
  await expect(
    page.getByText("No tag suggestions to review", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Suggest tags for 5 recipes" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Suggest tags for 5 recipes" }),
  ).toHaveAttribute("aria-busy", "false");
});

test("review starts compact, explains actions and keeps completed recipes in history", async ({
  page,
}) => {
  await page.goto("https://editorial.fixture/");
  await page.getByRole("button", { name: "Trigger new recipe" }).click();
  await page.getByRole("button", { name: /^Lemon chickpea rice/ }).click();
  await expect(page.getByText("300 g rice", { exact: true })).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Run culinary review" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Culinary review passed" }),
  ).toBeVisible();
  await page.getByText("Ingredients (2)", { exact: true }).click();
  await expect(page.getByText("300 g rice", { exact: true })).toBeVisible();
  await page.getByText("More actions", { exact: true }).click();
  await expect(
    page.getByLabel("Rejection reason", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Guidance for a replacement recipe (optional)"),
  ).toBeVisible();
  await page
    .getByLabel("Rejection reason", { exact: true })
    .fill("Too similar to another meal");
  await page
    .getByRole("button", { name: "Reject proposal", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /^Lemon chickpea rice/ }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "History", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /^Lemon chickpea rice/ }),
  ).toContainText("Rejected");
});

test("unsaved edits survive cancelled navigation and conflicting server revisions", async ({
  page,
}) => {
  await page.goto("https://editorial.fixture/");
  await page.getByRole("button", { name: "Trigger new recipe" }).click();
  await page.getByRole("button", { name: /^Lemon chickpea rice/ }).click();
  await page.getByRole("button", { name: "Edit recipe", exact: true }).click();
  await page
    .getByLabel("Title", { exact: true })
    .fill("My unsaved rice recipe");
  await page.getByRole("button", { name: "Trigger new recipe" }).click();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page
    .getByRole("button", { name: /^Lemon chickpea rice/ })
    .last()
    .click();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
    "My unsaved rice recipe",
  );
  page.once("dialog", (dialog) => dialog.dismiss());
  await page
    .getByRole("link", { name: "Back to Foodedo", exact: true })
    .click();
  await expect(page).toHaveURL("https://editorial.fixture/");
  // Target the first proposal, which is still open after cancelling navigation.
  await page.evaluate(() =>
    window.dispatchEvent(new Event("fixture:remote-update")),
  );
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
    "My unsaved rice recipe",
  );
  await expect(page.getByRole("alert")).toContainText(
    "Another administrator saved a newer revision",
  );
  await expect(
    page.getByRole("button", { name: "Save changes" }),
  ).toBeDisabled();
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Updated by another administrator",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByLabel("Title", { exact: true })).toHaveCount(0);
});

for (const width of [320, 390, 1280]) {
  test(`compact recipe review fits a ${width}px viewport`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("https://editorial.fixture/");
    await page.getByRole("button", { name: "Trigger new recipe" }).click();
    await page.getByRole("button", { name: /^Lemon chickpea rice/ }).click();
    await expect(
      page.getByRole("button", { name: "Approve recipe and generate image" }),
    ).toBeInViewport();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: testInfo.outputPath(`admin-${width}.png`),
      fullPage: true,
    });
  });
}

test("failed saves retain edits and allow a safe retry", async ({ page }) => {
  await page.goto("https://editorial.fixture/?fail=update");
  await page.getByRole("button", { name: "Trigger new recipe" }).click();
  await page.getByRole("button", { name: /^Lemon chickpea rice/ }).click();
  await page.getByRole("button", { name: "Edit recipe", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("My unsaved title");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Could not save recipe. Please retry.",
  );
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
    "My unsaved title",
  );
  await expect(
    page.getByRole("button", { name: "Save changes" }),
  ).toBeEnabled();
});

test("deleting a linked note removes dangling references and leaves a saveable recipe", async ({
  page,
}) => {
  await page.goto("https://editorial.fixture/");
  await page.getByRole("button", { name: "Trigger new recipe" }).click();
  await page.getByRole("button", { name: /^Lemon chickpea rice/ }).click();
  await page.getByRole("button", { name: "Edit recipe", exact: true }).click();
  await page.getByText("Recipe notes (1)", { exact: true }).click();
  await page
    .getByRole("button", { name: "Remove note 1", exact: true })
    .click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status")).toContainText("Changes saved.");
  await expect(
    page.getByRole("button", { name: "Run culinary review" }),
  ).toBeVisible();
  await expect(page.getByText("Recipe notes (1)", { exact: true })).toHaveCount(
    0,
  );
});

test("catalogue maintenance accepts a focused improvement and exposes the original for comparison", async ({
  page,
}) => {
  await page.goto("https://editorial.fixture/?screen=catalogue");
  await expect(
    page.getByRole("heading", { name: "Catalogue maintenance", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("searchbox", { name: "Find a catalogue recipe" })
    .fill("chickpea");
  await page.getByRole("button", { name: /^Lemon chickpea rice/ }).click();
  await page
    .getByLabel("Recipe improvement request (optional)", { exact: true })
    .fill("Use a roux for a more reliable sauce");
  await page
    .getByRole("button", { name: "Review and improve recipe", exact: true })
    .click();
  await expect(
    page.getByText("Improved the sauce sequence and consistency.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Use a roux for a more reliable sauce", { exact: false }),
  ).toBeVisible();
  await page
    .getByText("Original published recipe · revision 1", { exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Recipe preview" }),
  ).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "Approve recipe and generate image" }),
  ).toBeEnabled();
});

test("catalogue photograph replacement retains text, requires image approval and updates the version", async ({
  page,
}) => {
  await page.goto("https://editorial.fixture/?screen=catalogue");
  await page.getByRole("button", { name: /^Lemon chickpea rice/ }).click();
  await page.getByText("Replace the photograph only", { exact: true }).click();
  await page
    .getByRole("button", {
      name: "Generate replacement photograph",
      exact: true,
    })
    .click();
  await expect(
    page.getByText("Published recipe retained.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", {
      name: "Generated photograph of Lemon chickpea rice",
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Approve image and publish" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Recipe published to the catalogue.",
  );
  await expect(
    page.getByRole("button", { name: /^Lemon chickpea rice/ }),
  ).toContainText("revision 2");
});

test("catalogue maintenance is inaccessible to ordinary accounts and the served guest route asks for sign-in", async ({
  page,
}) => {
  await page.goto("https://editorial.fixture/?screen=catalogue&role=ordinary");
  await expect(
    page.getByRole("heading", { name: "Administrator access required" }),
  ).toBeVisible();
  await expect(page.getByRole("searchbox")).toHaveCount(0);
  await page.goto("/admin/catalogue");
  await expect(
    page.getByRole("heading", { name: "Catalogue maintenance", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("searchbox")).toHaveCount(0);
});

for (const width of [320, 1280]) {
  test(`catalogue maintenance fits a ${width}px viewport`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("https://editorial.fixture/?screen=catalogue");
    await page.getByRole("button", { name: /^Lemon chickpea rice/ }).click();
    await page
      .getByText("Replace the photograph only", { exact: true })
      .click();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: testInfo.outputPath(`maintenance-${width}.png`),
      fullPage: true,
    });
  });
}
