import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

const mode = process.argv[2];
assert.ok(
  ["web", "native"].includes(mode),
  "Usage: node scripts/check-blog-build.mjs web|native",
);
const manifest = JSON.parse(
  await readFile(".next/prerender-manifest.json", "utf8"),
);
const routePaths = JSON.parse(
  await readFile(".next/server/app-paths-manifest.json", "utf8"),
);
assert.equal(
  manifest.routes["/sitemap.xml"]?.compute,
  "static",
  "Sitemap must be statically generated",
);

if (mode === "web") {
  const inventory = JSON.parse(
    await readFile("docs/blog-url-inventory.json", "utf8"),
  );
  const routes = [
    "/blog",
    "/sitemap.xml",
    ...inventory.cmsArticles.map(({ path }) => path),
    ...inventory.localGuides.map(({ path }) => path),
  ];
  for (const route of routes) {
    assert.equal(
      manifest.routes[route]?.compute,
      "static",
      `${route} is not prerendered`,
    );
    assert.equal(
      manifest.routes[route]?.initialRevalidateSeconds,
      60,
      `${route} is not using the agreed ISR interval`,
    );
  }
  assert.ok(
    manifest.dynamicRoutes["/blog/[slug]"],
    "New article paths cannot be generated",
  );
  assert.notEqual(
    manifest.dynamicRoutes["/blog/[slug]"].fallback,
    false,
    "New articles must not require a rebuild",
  );
  console.log(
    "Blog index, all 33 preserved articles and sitemap are prerendered with 60-second ISR; new article paths remain enabled.",
  );
} else {
  assert.ok(
    !Object.keys(routePaths).some((route) => route.includes("/blog")),
    "Blog routes leaked into the native build",
  );
  assert.ok(
    (await stat("out/sitemap.xml")).isFile(),
    "Native catalogue sitemap was lost",
  );
  async function checkAssets(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await checkAssets(file);
      else if (/\.(?:html|js|json|txt)$/.test(file)) {
        const text = await readFile(file, "utf8");
        assert.doesNotMatch(
          text,
          /api\.sanity\.io|cdn\.sanity\.io|THE FOODEDO BLOG|href="\/blog"/,
          `Editorial content or Sanity code leaked into ${file}`,
        );
      }
    }
  }
  await checkAssets("out");
  console.log(
    "Native export retains the catalogue sitemap and excludes blog routes, editorial content and Sanity code.",
  );
}
