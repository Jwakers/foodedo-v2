import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  extractHtmlCandidate,
  extractTextCandidate,
  extractUrlCandidate,
  organiseCandidate,
} from "../convex/lib/recipeImport/pipeline";
import {
  createGatewayRecipeImportModelClient,
  type RecipeImportModelTelemetry,
} from "../convex/lib/recipeImport/models";
import type { RecipeSourceCandidate } from "../convex/lib/recipeImport/source";
import { ImportFailure } from "../convex/lib/recipeImport/contracts";
import {
  getRecipeReviewIssues,
  type RecipeContent,
  type RecipeMetadataProvenance,
} from "../src/lib/domain/recipes";

export type CorpusItem = {
  id: string;
  kind: "html" | "text" | "url";
  source?: string;
  fixture?: string;
  expect: "succeeded" | "needs_review" | "failed";
  expectedFailure?: string;
  expectedProtein?: RecipeContent["proteinCategory"];
  expectedServings?: number;
  expectedPrepMinutes?: number;
  expectedCookMinutes?: number;
  expectedTotalMinutes?: number;
  expectedPrepRange?: [number, number];
  expectedPrepOrigin?: RecipeMetadataProvenance["prepMinutes"];
  expectedCookOrigin?: RecipeMetadataProvenance["cookMinutes"];
  minimumIngredients?: number;
  minimumSteps?: number;
  minimumNotes?: number;
  expectedMethodPatterns?: string[];
  expectedNotePatterns?: string[];
  expectedIngredientPatterns?: Array<{
    name: string;
    amount?: string;
    note?: string;
    group?: string;
    noteReference?: boolean;
  }>;
  expectedIngredients?: Array<{
    name: string;
    amountText?: string;
    note?: string;
  }>;
  expectedIngredientCounts?: Array<{
    name: string;
    amountText: string;
    count: number;
    distinctGroups?: boolean;
  }>;
};

const fixtureDirectory = resolve(process.cwd(), "tests/fixtures");

export async function main() {
  if (!process.env.AI_GATEWAY_API_KEY) {
    throw new Error(
      "Set AI_GATEWAY_API_KEY before running the live importer evaluation.",
    );
  }
  const corpus = JSON.parse(
    await readFile(
      resolve(fixtureDirectory, "recipe-import-corpus.json"),
      "utf8",
    ),
  ) as CorpusItem[];
  const pricing = readPricing();
  const selected = process.argv
    .find((arg) => arg.startsWith("--case="))
    ?.slice(7);
  const selectedIds = selected === undefined ? undefined : selected.split(",");
  if (selectedIds) {
    const knownIds = new Set(corpus.map((item) => item.id));
    const unknownIds = selectedIds.filter((id) => !knownIds.has(id));
    if (unknownIds.length)
      throw new Error(
        `Unknown recipe evaluation cases: ${unknownIds.join(", ")}`,
      );
  }
  const results: Array<Record<string, unknown>> = [];
  const repeat = Number(
    process.argv.find((arg) => arg.startsWith("--repeat="))?.slice(9) ?? 1,
  );
  if (!Number.isInteger(repeat) || repeat < 1 || repeat > 5)
    throw new Error("--repeat must be between 1 and 5.");

  for (const item of corpus) {
    if (selectedIds && !selectedIds.includes(item.id)) continue;
    for (let run = 1; run <= repeat; run++) {
      const telemetry: RecipeImportModelTelemetry[] = [];
      const modelClient = createGatewayRecipeImportModelClient((event) =>
        telemetry.push(event),
      );
      const startedAt = performance.now();
      try {
        const candidate = await candidateFor(item);
        const outcome = await organiseCandidate(candidate, modelClient);
        if (process.argv.includes("--inspect"))
          console.log(
            JSON.stringify({
              case: item.id,
              recipe: outcome.recipe,
              metadataProvenance: outcome.metadataProvenance,
            }),
          );
        const metrics = score(outcome.recipe, item, outcome.metadataProvenance);
        results.push({
          case: item.id,
          run,
          ...metrics,
          passed:
            item.expect === "failed"
              ? false
              : metrics.core &&
                metrics.semanticPreservation &&
                metrics.metadataAccuracy &&
                metrics.measurementAccuracy &&
                !metrics.formattingDefect &&
                metrics.noteResolution,
          latencyMs: Math.round(performance.now() - startedAt),
          modelCalls: telemetry.length,
          fallbackUsed: telemetry.some((event) => event.gatewayFallbackUsed),
          inputTokens: total(telemetry, "inputTokens"),
          outputTokens: total(telemetry, "outputTokens"),
          estimatedCostUsd: telemetry.reduce(
            (sum, event) => sum + estimateCost(event, pricing),
            0,
          ),
        });
      } catch (error) {
        results.push({
          case: item.id,
          run,
          passed:
            item.expect === "failed" &&
            error instanceof ImportFailure &&
            error.code === item.expectedFailure,
          core: false,
          hardFailure: true,
          latencyMs: Math.round(performance.now() - startedAt),
          modelCalls: telemetry.length,
          fallbackUsed: telemetry.some((event) => event.gatewayFallbackUsed),
          inputTokens: total(telemetry, "inputTokens"),
          outputTokens: total(telemetry, "outputTokens"),
          error: error instanceof Error ? error.name : "UnknownError",
          failureCode: error instanceof ImportFailure ? error.code : "internal",
          failureDetails:
            error instanceof ImportFailure ? error.details : undefined,
          failureSourceIds:
            error instanceof ImportFailure ? error.sourceIds : undefined,
          failureReasons:
            error instanceof ImportFailure ? error.reasons : undefined,
        });
      }
      console.log("recipe_import_evaluation", JSON.stringify(results.at(-1)));
    }
  }

  console.table(
    results.map(
      ({
        case: id,
        passed,
        failureCode,
        failureReasons,
        latencyMs,
        modelCalls,
      }) => ({
        case: id,
        passed,
        failureCode,
        failureReasons,
        latencyMs,
        modelCalls,
      }),
    ),
  );
  console.table([
    {
      cases: results.length,
      accuracy: rate(results, "passed"),
      semanticPreservation: rate(results, "semanticPreservation"),
      metadataAccuracy: rate(results, "metadataAccuracy"),
      formattingDefectRate: rate(results, "formattingDefect"),
      methodCoverage: rate(results, "methodCoverage"),
      noteResolution: rate(results, "noteResolution"),
      reviewRate: rate(results, "reviewRequired"),
      hardFailureRate: rate(results, "hardFailure"),
      gatewayFallbackRate: rate(results, "fallbackUsed"),
      p50LatencyMs: percentile(results, 0.5),
      p95LatencyMs: percentile(results, 0.95),
      inputTokens: sum(results, "inputTokens"),
      outputTokens: sum(results, "outputTokens"),
      estimatedCostUsd: sum(results, "estimatedCostUsd") || "set pricing env",
    },
  ]);
  if (results.some((result) => !result.passed)) process.exitCode = 1;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === resolve("scripts/evaluate-recipe-import.ts")
)
  void main().catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : "Evaluation failed.",
    );
    process.exitCode = 1;
  });

async function candidateFor(item: CorpusItem): Promise<RecipeSourceCandidate> {
  if (item.kind === "text" && item.fixture)
    return extractTextCandidate(
      await readFile(resolve(fixtureDirectory, item.fixture), "utf8"),
    );
  if (item.kind === "url" && item.source)
    return extractUrlCandidate(item.source);
  if (item.kind === "text" && item.source) {
    return extractTextCandidate(item.source);
  }
  if (item.kind === "html" && item.fixture) {
    return extractHtmlCandidate(
      await readFile(resolve(fixtureDirectory, item.fixture), "utf8"),
      `https://evaluation.example/${item.id}`,
    );
  }
  throw new Error(`Unsupported corpus item: ${item.id}`);
}

export function score(
  recipe: RecipeContent,
  item: CorpusItem,
  provenance: RecipeMetadataProvenance,
) {
  const steps = recipe.steps.length;
  const core =
    recipe.ingredients.length >= (item.minimumIngredients ?? 1) &&
    steps >= (item.minimumSteps ?? 1);
  const matches = (pattern: string, value: string) =>
    new RegExp(pattern, "i").test(value.normalize("NFKC"));
  // Identity checks ignore typography only, never missing words or quantities.
  const identity = (value: string) =>
    value
      .normalize("NFKC")
      .toLowerCase()
      .trim()
      .replace(/\s*\/\s*/g, "/")
      .replace(/\s+/g, " ");
  const method = recipe.steps.map((step) => step.text).join("\n");
  const methodCoverage =
    Boolean(item.expectedMethodPatterns?.length) &&
    item.expectedMethodPatterns!.every((pattern) => matches(pattern, method));
  const ingredientCoverage =
    Boolean(
      item.expectedIngredients?.length ||
      item.expectedIngredientCounts?.length ||
      item.expectedIngredientPatterns?.length,
    ) &&
    (item.expectedIngredientPatterns ?? []).every((expected) =>
      recipe.ingredients.some(
        (line) =>
          matches(expected.name, line.name) &&
          (!expected.amount ||
            matches(expected.amount, line.amountText ?? "")) &&
          (!expected.note || matches(expected.note, line.note ?? "")) &&
          (!expected.group || matches(expected.group, line.group ?? "")) &&
          (!expected.noteReference || Boolean(line.noteRefs?.length)),
      ),
    ) &&
    (item.expectedIngredients ?? []).every((expected) =>
      recipe.ingredients.some(
        (actual) =>
          identity(actual.name) === identity(expected.name) &&
          (expected.amountText === undefined ||
            actual.amountText === expected.amountText) &&
          (expected.note === undefined || actual.note === expected.note),
      ),
    ) &&
    (item.expectedIngredientCounts ?? []).every((expected) => {
      const lines = recipe.ingredients.filter(
        (actual) =>
          identity(actual.name) === identity(expected.name) &&
          actual.amountText === expected.amountText,
      );
      return (
        lines.length === expected.count &&
        (!expected.distinctGroups ||
          new Set(lines.map((line) => line.group ?? "")).size ===
            expected.count)
      );
    });
  const noteResolution =
    (item.minimumNotes === undefined ||
      (recipe.notes?.length ?? 0) >= item.minimumNotes) &&
    recipe.ingredients.every((line) =>
      (line.noteRefs ?? []).every((id) =>
        recipe.notes?.some((note) => note.id === id),
      ),
    ) &&
    recipe.steps.every((line) =>
      (line.noteRefs ?? []).every((id) =>
        recipe.notes?.some((note) => note.id === id),
      ),
    ) &&
    (item.expectedNotePatterns ?? []).every((pattern) =>
      matches(
        pattern,
        (recipe.notes ?? []).map((note) => note.text).join("\n"),
      ),
    );
  return {
    core,
    // Independent fixture checks, not the production verifier judging itself.
    semanticPreservation:
      methodCoverage && ingredientCoverage && noteResolution,
    measurementAccuracy: ingredientCoverage,
    metadataAccuracy:
      (item.expectedProtein === undefined ||
        recipe.proteinCategory === item.expectedProtein) &&
      (item.expectedServings === undefined ||
        recipe.servings === item.expectedServings) &&
      (item.expectedPrepMinutes === undefined ||
        recipe.prepMinutes === item.expectedPrepMinutes) &&
      (item.expectedCookMinutes === undefined ||
        recipe.cookMinutes === item.expectedCookMinutes) &&
      (item.expectedTotalMinutes === undefined ||
        (recipe.prepMinutes !== undefined &&
          recipe.cookMinutes !== undefined &&
          recipe.prepMinutes + recipe.cookMinutes ===
            item.expectedTotalMinutes)) &&
      (!item.expectedPrepRange ||
        (recipe.prepMinutes !== undefined &&
          recipe.prepMinutes >= item.expectedPrepRange[0] &&
          recipe.prepMinutes <= item.expectedPrepRange[1])) &&
      (item.expectedPrepOrigin === undefined ||
        provenance.prepMinutes === item.expectedPrepOrigin) &&
      (item.expectedCookOrigin === undefined ||
        provenance.cookMinutes === item.expectedCookOrigin),
    formattingDefect: recipe.ingredients.some((ingredient) =>
      /\(\s*\(|\)\s*\)|,\s*,|^(?:g|l|ml|mg)\s/i.test(
        `${ingredient.amountText ?? ""} ${ingredient.name} ${ingredient.note ?? ""}`,
      ),
    ),
    methodCoverage,
    noteResolution,
    reviewRequired:
      getRecipeReviewIssues({
        ...recipe,
        source: {
          type: "import",
          method: item.kind === "text" ? "text" : "url",
          importedAt: 0,
        },
      }).length > 0,
    hardFailure: false,
  };
}

type Pricing = Record<string, { input: number; output: number }>;

function readPricing(): Pricing {
  try {
    return JSON.parse(
      process.env.RECIPE_IMPORT_MODEL_PRICING_USD_PER_MILLION ?? "{}",
    ) as Pricing;
  } catch {
    throw new Error(
      "RECIPE_IMPORT_MODEL_PRICING_USD_PER_MILLION must be JSON.",
    );
  }
}

function estimateCost(event: RecipeImportModelTelemetry, prices: Pricing) {
  const price = prices[event.resolvedModel];
  if (!price) return 0;
  return (
    ((event.inputTokens ?? 0) * price.input +
      (event.outputTokens ?? 0) * price.output) /
    1_000_000
  );
}

function total(
  rows: RecipeImportModelTelemetry[],
  key: "inputTokens" | "outputTokens",
) {
  return rows.reduce((sum, row) => sum + (row[key] ?? 0), 0);
}

function percentile(rows: Array<Record<string, unknown>>, fraction: number) {
  const values = rows
    .map((row) => Number(row.latencyMs))
    .sort((left, right) => left - right);
  return values[
    Math.min(values.length - 1, Math.floor(values.length * fraction))
  ];
}

function rate(rows: Array<Record<string, unknown>>, key: string) {
  const measured = rows.filter((row) => typeof row[key] === "boolean");
  if (measured.length === 0) return 0;
  return measured.filter((row) => row[key] === true).length / measured.length;
}

function sum(rows: Array<Record<string, unknown>>, key: string) {
  return rows.reduce(
    (totalValue, row) => totalValue + Number(row[key] ?? 0),
    0,
  );
}
