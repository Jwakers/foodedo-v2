import assert from "node:assert/strict";
import { lstat, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

// next build can succeed with missing trace entries that Vercel later fails to package.
// Check web-only handlers with standard route.js entrypoints: custom extensions
// can make Next trace a client-reference manifest that it never generates.
const routes = [
  "api/product-events/[...path]",
  "(product)/recipes/[slug]/social-image",
];
for (const route of routes) {
  const tracePath = resolve(`.next/server/app/${route}/route.js.nft.json`);
  const { files } = JSON.parse(await readFile(tracePath, "utf8"));
  const missing = (
    await Promise.all(
      files.map(async (file) => {
        try {
          await lstat(resolve(dirname(tracePath), file));
          return null;
        } catch {
          return file;
        }
      }),
    )
  ).filter(Boolean);
  assert.equal(
    missing.length,
    0,
    `${route} deployment trace references missing files:\n${missing.join("\n")}`,
  );
  console.log(
    `Verified all ${files.length} deployment trace files for ${route}.`,
  );
}
