import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const reviewedPath = path.resolve(
    __dirname,
    "../src/features/blog/reviewed-articles.json",
  );
  const reviewed = JSON.parse(await readFile(reviewedPath, "utf8"));
  // Keep only the fields useful for pushing content into Sanity.
  const exportData = reviewed.map(
    ({ slug, sourceId, title, excerpt, body, reviewedOn }) => ({
      slug,
      sourceId,
      title,
      excerpt,
      body,
      reviewedOn,
    }),
  );
  const outPath = path.resolve(__dirname, "../docs/blog-overrides-export.json");
  await writeFile(outPath, JSON.stringify(exportData, null, 2) + "\n", "utf8");
  console.log(`Wrote ${exportData.length} override entries to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

