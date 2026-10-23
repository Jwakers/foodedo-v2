/** Operator tool: preview by default; apply only an explicitly approved review file. */
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import {
  reviewSchema,
  exportSchema,
  prepareServingMinimumChanges,
} from "./serving-minimums-review";

const reviewPath = process.argv
  .find((arg) => arg.startsWith("--review="))
  ?.slice(9);
if (!reviewPath)
  throw new Error(
    "Provide --review=PATH. Default is preview; --apply requires an approved review.",
  );
const review = reviewSchema.parse(
  JSON.parse(fs.readFileSync(reviewPath, "utf8")),
);
const apply = process.argv.includes("--apply");
if (
  apply &&
  (review.reviewStatus !== "approved" || !review.reviewedBy?.trim())
) {
  throw new Error(
    "Review the proposed values, set reviewStatus to approved and record reviewedBy before applying.",
  );
}
// Convex CLI supplies operator authentication. No deployment push or production switch here.
function run(name: string, args: unknown) {
  return JSON.parse(
    execFileSync(
      "pnpm",
      [
        "exec",
        "convex",
        "run",
        name,
        JSON.stringify(args),
        "--codegen",
        "disable",
        "--typecheck",
        "disable",
      ],
      { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
    ),
  );
}
const before = exportSchema.parse(
  run("catalogueMaintenance:exportServingMinimums", {}),
);
const changes = await prepareServingMinimumChanges(review, before);
console.log(
  JSON.stringify(
    {
      audited: review.rows.length,
      changes: changes.map(({ catalogueMealId, minimumServings, reason }) => ({
        catalogueMealId,
        minimumServings,
        reason,
      })),
    },
    null,
    2,
  ),
);
if (apply) {
  for (let start = 0; start < changes.length; start += 25) {
    run("catalogueMaintenance:applyServingMinimums", {
      reviewedBy: review.reviewedBy,
      rows: changes.slice(start, start + 25).map((row) => ({
        catalogueMealId: row.catalogueMealId,
        version: row.version,
        fingerprint: row.fingerprint,
        minimumServings: row.minimumServings,
        reason: row.reason,
      })),
    });
  }
  const after = exportSchema.parse(
    run("catalogueMaintenance:exportServingMinimums", {}),
  );
  for (const row of review.rows) {
    const current = after.find(
      (meal) => meal.catalogueMealId === row.catalogueMealId,
    );
    if (
      !current ||
      current.content.minimumServings !== (row.minimumServings ?? undefined) ||
      current.fingerprint !== row.resultFingerprint
    )
      throw new Error(`Verification failed: ${row.catalogueMealId}`);
  }
  const receiptPath = `${reviewPath}.applied.json`;
  // Keep the original publication receipt intact when verifying an idempotent rerun.
  if (changes.length > 0 || !fs.existsSync(receiptPath))
    fs.writeFileSync(
      receiptPath,
      JSON.stringify(
        {
          appliedAt: new Date().toISOString(),
          verified: review.rows.length,
          changes: changes.length,
        },
        null,
        2,
      ) + "\n",
    );
  console.log(
    `Verified ${review.rows.length} recipes; published ${changes.length} minimum-serving revisions.`,
  );
}
