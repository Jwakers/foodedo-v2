import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { load } from "cheerio";

// Read-only: accepts a local production server, deployed preview or production.
const base = new URL(process.argv[2] || "http://127.0.0.1:3100");
const canonical =
  process.env.SITE_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  "https://www.foodedo.com";
const { entries } = JSON.parse(
  await readFile(
    new URL("../docs/public-url-inventory.json", import.meta.url),
    "utf8",
  ),
);
const get = (path) =>
  fetch(new URL(path, base), {
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
  });
const sitemapResponse = await get("/sitemap.xml");
assert.equal(sitemapResponse.status, 200, "Sitemap unavailable");
const sitemap = load(await sitemapResponse.text(), { xmlMode: true });
const locations = new Set(
  sitemap("loc")
    .map((_, element) => sitemap(element).text())
    .get(),
);
const failures = [];
for (let offset = 0; offset < entries.length; offset += 4) {
  await Promise.all(
    entries.slice(offset, offset + 4).map(async (entry) => {
      try {
        let response = await get(entry.path);
        assert.equal(
          response.status,
          entry.status,
          `${entry.path}: initial status`,
        );
        if (entry.status === 307 || entry.status === 308) {
          const location = new URL(response.headers.get("location"), base);
          assert.equal(
            location.origin,
            base.origin,
            `${entry.path}: redirect origin`,
          );
          assert.equal(
            location.pathname,
            entry.destination,
            `${entry.path}: redirect destination`,
          );
          response = await get(entry.destination);
          assert.equal(
            response.status,
            entry.finalStatus,
            `${entry.path}: destination status (no chains)`,
          );
          assert.ok(
            !locations.has(new URL(entry.path, canonical).href),
            `${entry.path}: redirect in sitemap`,
          );
        }
        if (entry.finalStatus !== 200 || entry.destination === "/") return;
        const $ = load(await response.text());
        assert.equal($("h1").length, 1, `${entry.path}: expected one H1`);
        assert.ok(
          $("h1").text().trim().length > 5,
          `${entry.path}: empty heading`,
        );
        assert.ok(
          $("main").text().trim().length > 100,
          `${entry.path}: missing initial content`,
        );
        assert.ok(
          $("title").text().trim().length > 5,
          `${entry.path}: missing title`,
        );
        assert.equal(
          $("link[rel=canonical]").attr("href"),
          new URL(entry.destination, canonical).href,
          `${entry.path}: canonical`,
        );
        assert.doesNotMatch(
          $("meta[name=robots]").attr("content") || "",
          /noindex/i,
          `${entry.path}: noindex`,
        );
        assert.doesNotMatch(
          response.headers.get("x-robots-tag") || "",
          /noindex/i,
          `${entry.path}: noindex header`,
        );
        assert.ok(
          locations.has(new URL(entry.destination, canonical).href),
          `${entry.path}: missing sitemap entry`,
        );
      } catch (error) {
        failures.push(error.message);
      }
    }),
  );
}
for (const path of [
  "/pricing?source=legacy",
  "/beta?source=legacy",
  "/discover?source=legacy",
  "/discover/recipe/chicken-tacos-with-salsa?source=legacy",
  "/recipes/chicken-tacos-with-salsa?source=legacy",
]) {
  const response = await get(path);
  assert.equal(
    new URL(response.headers.get("location"), base).searchParams.get("source"),
    "legacy",
    `${path}: lost query`,
  );
}
assert.equal(
  (await get("/public-migration-definitely-missing-page")).status,
  404,
);
const robots = await (await get("/robots.txt")).text();
assert.ok(robots.includes(`Sitemap: ${new URL("/sitemap.xml", canonical)}`));
assert.deepEqual(failures, [], failures.join("\n"));
console.log(
  `Verified ${entries.length} public legacy URLs at ${base.origin}, including restored contact and the removed-recipe exception. Statuses, redirects, initial content, canonicals, indexability and sitemap passed.`,
);
