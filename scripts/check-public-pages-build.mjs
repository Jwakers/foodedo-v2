import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const mode = process.argv[2];
assert.ok(
  ["native", "web"].includes(mode),
  "Usage: node scripts/check-public-pages-build.mjs native|web",
);
const pages = JSON.parse(
  await readFile("src/features/public-pages/pages.json", "utf8"),
);
const prerender = JSON.parse(
  await readFile(".next/prerender-manifest.json", "utf8"),
);
const routes = JSON.parse(
  await readFile(".next/server/app-paths-manifest.json", "utf8"),
);
if (mode === "web") {
  for (const page of pages)
    assert.equal(
      prerender.routes[page.path]?.compute,
      "static",
      `${page.path} must be prerendered`,
    );
  const { redirects } = JSON.parse(
    await readFile(".next/routes-manifest.json", "utf8"),
  );
  for (const [source, destination, statusCode] of [
    ["/pricing", "/faq", 307],
    ["/beta", "/", 308],
    [
      "/discover/recipe/chicken-tacos-with-salsa",
      "/recipes/chicken-tacos-with-avocado-salsa",
      308,
    ],
    [
      "/recipes/chicken-tacos-with-salsa",
      "/recipes/chicken-tacos-with-avocado-salsa",
      308,
    ],
  ]) {
    assert.ok(
      redirects.some(
        (rule) =>
          rule.source === source &&
          rule.destination === destination &&
          rule.statusCode === statusCode,
      ),
      `${source}: wrong redirect`,
    );
  }
} else {
  for (const page of pages)
    assert.ok(
      !Object.keys(routes).some(
        (route) => route === `/(editorial)${page.path}/page`,
      ),
      `${page.path} leaked into native routes`,
    );
  async function inspect(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await inspect(file);
      else if (/\.(html|js|json|txt)$/.test(file)) {
        const content = await readFile(file, "utf8");
        assert.ok(
          !content.includes("A more useful week"),
          `Public page content leaked into ${file}`,
        );
        assert.doesNotMatch(
          content,
          /formspree\.io\/f\/|FORMSPREE_FORM_ID/,
          `Contact form leaked into ${file}`,
        );
        for (const page of pages)
          assert.ok(
            !content.includes(`href="${page.path}"`),
            `Public navigation leaked into ${file}`,
          );
      }
    }
  }
  await inspect("out");
}
console.log(
  `Public pages ${mode} build checks passed (${pages.length} restored pages).`,
);
