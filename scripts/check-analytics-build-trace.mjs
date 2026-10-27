import { lstat, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

// next build can succeed with missing trace entries that Vercel later fails to package.
const tracePath = resolve(
  ".next/server/app/api/product-events/[...path]/route.js.nft.json",
);
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
if (missing.length) {
  throw new Error(
    `Analytics deployment trace references missing files:\n${missing.join("\n")}`,
  );
}
console.log(`Verified all ${files.length} analytics deployment trace files.`);
