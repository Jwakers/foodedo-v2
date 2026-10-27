import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Read-only migration check. Run against a local build, preview or production.
const base = new URL(process.argv[2] || "http://127.0.0.1:3100");
const canonical =
  process.env.SITE_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  "https://www.foodedo.com";
const inventory = JSON.parse(
  await readFile(
    new URL("../docs/blog-url-inventory.json", import.meta.url),
    "utf8",
  ),
);
const reviewedArticles = JSON.parse(
  await readFile(
    new URL("../src/features/blog/reviewed-articles.json", import.meta.url),
    "utf8",
  ),
);
const reviewedByPath = new Map(
  reviewedArticles.map((article) => [`/blog/${article.slug}`, article]),
);
const project = process.env.SANITY_PROJECT_ID || "i8ook8b1";
const dataset = process.env.SANITY_DATASET || "production";
const sourceUrl = new URL(
  `https://${project}.api.sanity.io/v2024-01-01/data/query/${encodeURIComponent(dataset)}`,
);
sourceUrl.searchParams.set("perspective", "published");
sourceUrl.searchParams.set(
  "query",
  '*[_type == "post" && defined(slug.current) && !(_id in path("drafts.**"))]{_id,title,"path":"/blog/"+slug.current}',
);

async function get(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  assert.equal(response.status, 200, `${url}: HTTP ${response.status}`);
  return response;
}

const source = await (await get(sourceUrl)).json();
assert.ok(
  Array.isArray(source.result),
  "Sanity did not return a published article list",
);
const entries = new Map(
  [...inventory.cmsArticles, ...source.result, ...inventory.localGuides].map(
    (article) => [article.path, article],
  ),
);
const index = await (await get(new URL("/blog", base))).text();
const sitemapResponse = await get(new URL("/sitemap.xml", base));
assert.match(sitemapResponse.headers.get("content-type") || "", /xml/);
const sitemap = await sitemapResponse.text();
const robots = await (await get(new URL("/robots.txt", base))).text();
assert.ok(robots.includes(`Sitemap: ${new URL("/sitemap.xml", canonical)}`));
assert.ok(sitemap.includes("/recipes/"), "Catalogue sitemap entries were lost");

const articles = [...entries.values()];
for (let offset = 0; offset < articles.length; offset += 4) {
  await Promise.all(
    articles.slice(offset, offset + 4).map(async ({ path, title, _id }) => {
      assert.ok(
        index.includes(`href="${path}"`),
        `Not linked from the index: ${path}`,
      );
      assert.ok(
        sitemap.includes(`<loc>${new URL(path, canonical)}</loc>`),
        `Missing sitemap entry: ${path}`,
      );
      const html = await (await get(new URL(path, base))).text();
      assert.ok(
        html.includes(`rel="canonical" href="${new URL(path, canonical)}"`),
        `Wrong canonical: ${path}`,
      );
      assert.equal(
        (html.match(/<h1[ >]/g) || []).length,
        1,
        `Expected one H1: ${path}`,
      );
      const json =
        /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html);
      assert.ok(json, `Missing structured data: ${path}`);
      assert.equal(
        JSON.parse(json[1]).headline,
        _id && reviewedByPath.get(path)?.sourceId === _id
          ? reviewedByPath.get(path).title
          : title,
        `Changed title: ${path}`,
      );
      assert.doesNotMatch(
        html,
        /href="(?:https:\/\/(?:www\.)?foodedo\.com)?\/(?:dashboard|sign-up|pricing)(?:[/?"#])/,
        `Unresolved V1 link: ${path}`,
      );
    }),
  );
}
const missing = await fetch(
  new URL("/blog/blog-migration-missing-article-check", base),
);
assert.equal(missing.status, 404, "Missing article does not return HTTP 404");
console.log(
  `Verified ${source.result.length} current CMS articles, ${inventory.localGuides.length} local guides and ${articles.length} preserved URLs at ${base.origin}. Sitemap, canonicals, initial HTML, links and 404 passed.`,
);
