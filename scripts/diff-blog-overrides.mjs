import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectId = process.env.SANITY_PROJECT_ID?.trim() || "i8ook8b1";
const dataset = process.env.SANITY_DATASET?.trim() || "production";

async function fetchSanity(query, params = {}) {
  const url = new URL(
    `https://${projectId}.api.sanity.io/v2024-01-01/data/query/${encodeURIComponent(
      dataset,
    )}`,
  );
  url.searchParams.set("query", query);
  url.searchParams.set("perspective", "published");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(`$${k}`, JSON.stringify(v));
  }
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  assert.equal(
    response.ok,
    true,
    `Sanity request failed: HTTP ${response.status}`,
  );
  return response.json();
}

function portableTextToPlain(blocks) {
  if (!Array.isArray(blocks)) return "";
  return blocks
    .map((b) =>
      b &&
      typeof b === "object" &&
      b._type === "block" &&
      Array.isArray(b.children)
        ? b.children
            .map((s) => (typeof s.text === "string" ? s.text : ""))
            .join("")
        : "",
    )
    .join("\n")
    .trim();
}

async function main() {
  const reviewedPath = path.resolve(
    __dirname,
    "../src/features/blog/reviewed-articles.json",
  );
  const reviewed = JSON.parse(await readFile(reviewedPath, "utf8"));
  const reviewedBySlug = new Map(reviewed.map((r) => [r.slug, r]));

  const sanity = await fetchSanity(
    '*[_type == "post" && defined(slug.current) && !(_id in path("drafts.**"))]{_id, "slug": slug.current, title, excerpt, body}',
  );
  const sanityBySlug = new Map(sanity.result.map((p) => [p.slug, p]));

  const diffs = [];
  for (const [slug, override] of reviewedBySlug) {
    const cms = sanityBySlug.get(slug);
    if (!cms) {
      diffs.push({
        slug,
        status: "missing-in-sanity",
        override: { title: override.title, excerpt: override.excerpt },
      });
      continue;
    }
    const fields = [];
    if ((cms.title || "") !== (override.title || "")) fields.push("title");
    if ((cms.excerpt || "") !== (override.excerpt || ""))
      fields.push("excerpt");
    const cmsText = portableTextToPlain(cms.body);
    const overrideText = portableTextToPlain(override.body);
    if (cmsText !== overrideText) fields.push("body");
    if (fields.length) {
      diffs.push({
        slug,
        cms: { title: cms.title, excerpt: cms.excerpt },
        override: { title: override.title, excerpt: override.excerpt },
        changedFields: fields,
      });
    }
  }

  const outPath = path.resolve(__dirname, "../docs/blog-overrides-diff.json");
  await writeFile(outPath, JSON.stringify(diffs, null, 2) + "\n", "utf8");
  console.log(`Wrote ${diffs.length} diffs to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
