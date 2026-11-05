import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import { instagramPostUrl } from "../src/lib/domain/social-import";
const run = promisify(execFile);
const verification = z.object({
  minimumIngredients: z.number().int().min(1).max(100),
  minimumSteps: z.number().int().min(1).max(100),
  ingredients: z
    .array(
      z.object({
        name: z.string().min(1).max(160),
        aliases: z.array(z.string().min(1).max(160)).max(6).optional(),
        amounts: z.array(z.string().min(1).max(160)).min(1).max(6),
      }),
    )
    .min(2)
    .max(30),
  methodFacts: z.array(z.string().min(1).max(160)).min(1).max(30),
  methodAlternatives: z
    .array(z.array(z.string().min(1).max(160)).min(1).max(6))
    .max(10)
    .optional(),
});
const caseSchema = z.object({
  id: z.string().min(1).max(100),
  url: z.string().url().max(2048),
  category: z.enum([
    "caption",
    "linked",
    "partial",
    "media_only",
    "bio_only",
    "linked_unavailable",
    "inaccessible",
  ]),
  expectedFragments: z.array(z.string().min(1).max(160)).max(32),
  reviewed: z.literal(true),
  expectedOutcome: z.enum([
    "usable",
    "not_usable",
    "invalid_url",
    "not_found",
    "recipe_or_draft",
  ]),
  verification: verification.optional(),
});
const resultSchema = z.object({
  acquired: z.boolean(),
  latencyMs: z.number().nonnegative(),
  extractor: z.string().optional(),
  missingFragments: z.array(z.string()).optional(),
  outcome: z.string().optional(),
  normalization: z
    .object({
      outcome: z.string(),
      usable: z.boolean(),
      verified: z.boolean(),
      missingFacts: z.array(z.string()),
      modelCalls: z.number(),
      inputTokens: z.number().optional(),
      outputTokens: z.number().optional(),
      usageComplete: z.boolean().optional(),
      latencyMs: z.number(),
    })
    .optional(),
});
type Result = z.infer<typeof resultSchema>;
export type BenchmarkRow = {
  id: string;
  category: string;
  repeat: number;
  supported: boolean;
  harnessOutcome: string;
  harnessMs: number;
  acquisitionMs: number | null;
  acquisitionPassed: boolean | null;
  recipePassed: boolean | null;
  outcome?: string;
  normalizationOutcome?: string;
  totalMs?: number;
  missingFacts?: string[];
  missingFactCount?: number;
  modelCalls?: number;
};
export function evaluateResult(
  item: z.infer<typeof caseSchema>,
  result: Result,
  normalized: boolean,
) {
  const supported = ["caption", "linked"].includes(item.category);
  const acquisitionPassed =
    item.expectedOutcome === "invalid_url" ||
    item.expectedOutcome === "not_found"
      ? !result.acquired && result.outcome === item.expectedOutcome
      : result.acquired &&
        (result.missingFragments?.length ?? 0) === 0 &&
        (item.category !== "linked" || result.extractor === "html");
  const n = result.normalization;
  const recipePassed = !normalized
    ? null
    : item.expectedOutcome === "usable"
      ? Boolean(n?.usable && n.verified && acquisitionPassed)
      : item.expectedOutcome === "recipe_or_draft"
        ? Boolean(
            acquisitionPassed && n && ["usable", "draft"].includes(n.outcome),
          )
        : item.expectedOutcome === "invalid_url" ||
            item.expectedOutcome === "not_found"
          ? acquisitionPassed
          : Boolean(
              acquisitionPassed &&
              n &&
              !n.usable &&
              ["draft", "no_recipe", "video_only_unsupported"].includes(
                n.outcome,
              ),
            );
  return { supported, acquisitionPassed, recipePassed };
}
export function summarize(rows: BenchmarkRow[]) {
  const supported = rows.filter((x) => x.supported);
  const acquisitionSuccessRate = supported.length
    ? supported.filter((x) => x.acquisitionPassed === true).length /
      supported.length
    : null;
  const recipes = supported.filter((x) => x.repeat === 1);
  const usableRecipeSuccessRate = recipes.every((x) => x.recipePassed === null)
    ? null
    : recipes.filter((x) => x.recipePassed === true).length / recipes.length;
  const measured = supported
    .flatMap((x) => (x.acquisitionMs === null ? [] : [x.acquisitionMs]))
    .sort((a, b) => a - b);
  const p95AcquisitionMs = measured.length
    ? measured[Math.ceil(measured.length * 0.95) - 1]
    : null;
  const harnessFailures = rows.filter(
    (x) => x.harnessOutcome !== "completed",
  ).length;
  const negativeRecipeFailures = rows.filter(
    (x) => !x.supported && x.recipePassed === false,
  ).length;
  return {
    distinctPosts: new Set(rows.map((x) => x.id)).size,
    distinctSupportedPosts: new Set(supported.map((x) => x.id)).size,
    attempts: rows.length,
    supportedAttempts: supported.length,
    acquisitionSuccessRate,
    usableRecipeSuccessRate,
    p95AcquisitionMs,
    harnessFailures,
    negativeRecipeFailures,
    qualified:
      new Set(rows.map((x) => x.id)).size >= 32 &&
      new Set(supported.map((x) => x.id)).size >= 20 &&
      [...new Set(rows.map((x) => x.id))].every(
        (id) =>
          rows.filter((x) => x.id === id).length === 2 &&
          rows.some((x) => x.id === id && x.repeat === 1) &&
          rows.some((x) => x.id === id && x.repeat === 2),
      ) &&
      acquisitionSuccessRate !== null &&
      acquisitionSuccessRate >= 0.9 &&
      usableRecipeSuccessRate !== null &&
      usableRecipeSuccessRate >= 0.9 &&
      p95AcquisitionMs !== null &&
      p95AcquisitionMs <= 45_000 &&
      harnessFailures === 0 &&
      negativeRecipeFailures === 0 &&
      !rows.some((x) =>
        ["wrong_post", "configuration"].includes(x.outcome ?? ""),
      ),
  };
}
async function main() {
  const path = process.argv.find((x) => x.startsWith("--manifest="))?.slice(11);
  if (!path) throw new Error("Pass --manifest=/path/to/reviewed-cases.json.");
  let cases = z
    .array(caseSchema)
    .min(32)
    .max(40)
    .parse(JSON.parse(await readFile(path, "utf8")));
  const identities = cases.map((x) => instagramPostUrl(x.url)?.url ?? x.url);
  if (
    new Set(cases.map((x) => x.id)).size !== cases.length ||
    new Set(identities).size !== cases.length
  )
    throw new Error("Duplicate post identity or case ID.");
  const supported = cases.filter((x) =>
    ["caption", "linked"].includes(x.category),
  );
  if (supported.length < 20)
    throw new Error(
      "Register at least 20 independently reviewed supported posts.",
    );
  for (const item of supported)
    if (
      item.expectedOutcome !== "usable" ||
      item.expectedFragments.length < 3 ||
      !item.verification
    )
      throw new Error(
        `Missing independent source/recipe facts for ${item.id}.`,
      );
  const selected = process.argv
    .find((x) => x.startsWith("--case="))
    ?.slice(7)
    .split(",");
  if (selected) {
    if (selected.some((id) => !cases.some((item) => item.id === id)))
      throw new Error("Unknown diagnostic case.");
    cases = cases.filter((item) => selected.includes(item.id));
  }
  const rounds = process.argv.includes("--one-round") ? [1] : [1, 2];
  const acquisitionOnly = process.argv.includes("--acquisition-only");
  const rows: BenchmarkRow[] = [];
  // Separate rounds; each post is sampled again after the first round, not simultaneously.
  for (const repeat of rounds) {
    let next = 0;
    async function worker() {
      while (next < cases.length) {
        const item = cases[next++];
        const normalized = !acquisitionOnly && repeat === 1;
        const started = Date.now();
        let row: BenchmarkRow;
        try {
          const output = await run(
            "pnpm",
            [
              "exec",
              "convex",
              "run",
              "instagramImportEvaluation:probe",
              JSON.stringify({
                url: item.url,
                expectedFragments: item.expectedFragments,
                normalize: normalized,
                ...(item.verification
                  ? { verification: item.verification }
                  : {}),
              }),
            ],
            {
              timeout: normalized ? 210_000 : 90_000,
              maxBuffer: 100_000,
              killSignal: "SIGKILL",
            },
          );
          const result = resultSchema.parse(JSON.parse(output.stdout));
          row = {
            id: item.id,
            category: item.category,
            repeat,
            ...evaluateResult(item, result, normalized),
            harnessOutcome: "completed",
            harnessMs: Date.now() - started,
            acquisitionMs: result.latencyMs,
            ...(result.outcome ? { outcome: result.outcome } : {}),
            ...(result.normalization
              ? {
                  normalizationOutcome: result.normalization.outcome,
                  totalMs: result.normalization.latencyMs,
                  missingFacts: result.normalization.missingFacts,
                  modelCalls: result.normalization.modelCalls,
                  ...(result.normalization.inputTokens !== undefined
                    ? {
                        inputTokens: result.normalization.inputTokens,
                        outputTokens: result.normalization.outputTokens,
                        usageComplete: result.normalization.usageComplete,
                      }
                    : {}),
                  missingFactCount: result.normalization.missingFacts.length,
                }
              : {}),
            ...((result.missingFragments?.length ?? 0) > 0
              ? { missingFactCount: result.missingFragments!.length }
              : {}),
          };
        } catch (error) {
          const detail = error as {
            killed?: boolean;
            code?: unknown;
            signal?: unknown;
          };
          // Never print command strings/stdout/stderr: those may contain private source data.
          const harnessOutcome =
            error instanceof z.ZodError
              ? "invalid_probe_result"
              : error instanceof SyntaxError
                ? "invalid_probe_json"
                : detail.killed || detail.signal === "SIGKILL"
                  ? "harness_timeout"
                  : "transport_or_cli_error";
          row = {
            id: item.id,
            category: item.category,
            repeat,
            supported: ["caption", "linked"].includes(item.category),
            harnessOutcome,
            harnessMs: Date.now() - started,
            acquisitionMs: null,
            acquisitionPassed: null,
            recipePassed: null,
          };
        }
        rows.push(row);
        console.log(JSON.stringify(row));
      }
    }
    await Promise.all([worker(), worker()]);
  }
  const summary = summarize(rows);
  console.log(
    JSON.stringify({
      provider: "apify",
      scope: acquisitionOnly
        ? "acquisition"
        : "acquisition + shared normalization, no recipe writes",
      ...summary,
    }),
  );
  if (!summary.qualified) process.exitCode = 1;
}
if (process.argv[1]?.endsWith("evaluate-instagram-acquisition.ts"))
  void main().catch((error) => {
    console.error(
      error instanceof z.ZodError
        ? "Invalid reviewed manifest."
        : error instanceof Error
          ? error.message
          : "Evaluation failed.",
    );
    process.exitCode = 1;
  });
