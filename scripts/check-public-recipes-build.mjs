import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const mode = process.argv[2];
assert.ok(
  ["web", "native"].includes(mode),
  "Usage: node scripts/check-public-recipes-build.mjs web|native",
);
const manifest = JSON.parse(
  await readFile(".next/prerender-manifest.json", "utf8"),
);
const paths = JSON.parse(
  await readFile(".next/server/app-paths-manifest.json", "utf8"),
);

if (mode === "native") {
  assert.ok(
    !Object.keys(paths).some(
      (path) =>
        path.includes("/discover") ||
        path.includes("/recipes/[slug]") ||
        path.includes("/recipes/page/"),
    ),
    "Public recipe routes leaked into iOS",
  );
  for (const route of [
    "/recipes",
    "/recipes/view",
    "/recipes/cook",
    "/week",
    "/shop",
  ]) {
    assert.equal(
      manifest.routes[route]?.compute,
      "static",
      `${route} must remain a static app screen`,
    );
  }
  const sitemap = await readFile("out/sitemap.xml", "utf8");
  assert.ok(
    sitemap.includes("/recipes/view?slug="),
    "Native sitemap behavior changed",
  );
  assert.ok(
    !sitemap.includes("/discover/recipe/"),
    "Web recipe URLs leaked into native sitemap",
  );
  async function checkAssets(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await checkAssets(file);
      else if (/\.(?:html|js|json)$/.test(file)) {
        assert.doesNotMatch(
          await readFile(file, "utf8"),
          /public-recipe-detail-v1|public-recipes-list-v1|public-recipes-page-v1/,
          `Server-only recipe fetching leaked into ${file}`,
        );
      }
    }
  }
  await checkAssets("out");
  console.log(
    "Native export excludes public recipe routes and retains existing app routes and sitemap.",
  );
} else {
  const inventory = JSON.parse(
    await readFile("docs/recipe-url-inventory.json", "utf8"),
  );
  assert.equal(
    manifest.routes["/recipes"],
    undefined,
    "Query-driven directory must render at request time",
  );
  assert.ok(paths["/(product)/recipes/page"], "Web directory route is missing");
  for (const entry of inventory.recipes.filter(
    (entry) => entry.outcome === "permanent-redirect",
  )) {
    assert.equal(
      manifest.routes[entry.canonicalPath]?.compute,
      "static",
      `${entry.path} is not prebuilt`,
    );
    assert.equal(
      manifest.routes[entry.canonicalPath]?.initialRevalidateSeconds,
      86400,
      `${entry.path} must use 24-hour ISR`,
    );
  }
  assert.ok(manifest.dynamicRoutes["/recipes/[slug]"]);
  assert.notEqual(
    manifest.dynamicRoutes["/recipes/[slug]"].fallback,
    false,
    "New recipes must render without rebuilding",
  );
  assert.ok(
    !Object.keys(paths).some((route) => route.includes("/recipes/page/")),
    "Separate path-based directory routes must not remain",
  );
  const sitemap = await readFile(".next/server/app/sitemap.xml.body", "utf8");
  assert.ok(sitemap.includes("/recipes/beef-lasagne"));
  assert.ok(!sitemap.includes("/discover"));
  assert.ok(!sitemap.includes("/recipes/view?"));
  console.log(
    "Public recipe pages are prebuilt with 24-hour ISR; directory renders query parameters using cached catalogue data; new slugs remain enabled.",
  );
}
