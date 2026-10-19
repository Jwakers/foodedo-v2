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
import { parallelBenchmarkClient } from "./recipe-import-parallel-benchmark";
import {
  formatImportAmount,
  type ImportAmount,
} from "../convex/lib/recipeImport/measurements";
import {
  getRecipeReviewIssues,
  type RecipeContent,
  type RecipeMetadataProvenance,
  type RecipeIngredientLine,
} from "../src/lib/domain/recipes";

export type CorpusItem = {
  id: string;
  kind: "html" | "text" | "url";
  source?: string;
  fixture?: string;
  expect: "succeeded" | "needs_review" | "awaiting_input" | "failed";
  expectedDraftAreas?: string[];
  expectedFailure?: string;
  expectedProtein?: RecipeContent["proteinCategory"];
  expectedServings?: number;
  expectedPrepMinutes?: number;
  expectedCookMinutes?: number;
  expectedTotalMinutes?: number;
  expectedPrepRange?: [number, number];
  expectedPrepOrigin?: RecipeMetadataProvenance["prepMinutes"];
  expectedCookOrigin?: RecipeMetadataProvenance["cookMinutes"];
  expectedCookOrigins?: Array<
    NonNullable<RecipeMetadataProvenance["cookMinutes"]>
  >;
  minimumIngredients?: number;
  minimumSteps?: number;
  minimumNotes?: number;
  expectedMethodPatterns?: string[];
  expectedNotePatterns?: string[];
  expectedIngredientPatterns?: Array<{
    name: string;
    amount?: string;
    measurement?: ImportAmount;
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
    namePattern?: string;
    amountText?: string;
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
    let baseline: string | undefined;
    for (let run = 1; run <= repeat; run++) {
      const telemetry: RecipeImportModelTelemetry[] = [];
      const baseClient = createGatewayRecipeImportModelClient((event) =>
        telemetry.push(event),
      );
      const parallel = process.argv.includes("--benchmark-parallel");
      const modelClient = parallel
        ? parallelBenchmarkClient(baseClient)
        : baseClient;
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
              issues: outcome.issues,
            }),
          );
        const metrics = score(outcome.recipe, item, outcome.metadataProvenance);
        const signature = measurementSignature(outcome.recipe, item);
        const repeatMeasurementsStable =
          baseline === undefined || signature === baseline;
        baseline ??= signature;
        results.push({
          case: item.id,
          experiment: parallel ? "parallel" : "coherent",
          run,
          ...metrics,
          ...(!metrics.core
            ? {
                coreDiagnostics: {
                  ingredients: outcome.recipe.ingredients.map(
                    ({ name, amountText }) => ({ name, amountText }),
                  ),
                  steps: outcome.recipe.steps.map(({ text }) => text),
                },
              }
            : {}),
          metadata: {
            servings: outcome.recipe.servings,
            prepMinutes: outcome.recipe.prepMinutes,
            cookMinutes: outcome.recipe.cookMinutes,
            provenance: outcome.metadataProvenance,
          },
          ...(!metrics.measurementAccuracy
            ? {
                ingredientDiagnostics: outcome.recipe.ingredients.map(
                  ({ name, amountText, group }) => ({
                    name,
                    amountText,
                    group,
                  }),
                ),
              }
            : {}),
          ...(!metrics.methodCoverage
            ? {
                methodDiagnostics: outcome.recipe.steps.map(({ text }) => text),
              }
            : {}),
          outcome: outcome.status,
          repeatMeasurementsStable,
          passed:
            item.expect === "failed"
              ? false
              : (item.expect === "awaiting_input"
                  ? outcome.status === "draft" &&
                    (item.expectedDraftAreas ?? []).every((area) =>
                      outcome.issues.some(
                        (issue) => issue.blocking && issue.area === area,
                      ),
                    )
                  : outcome.status === "usable") &&
                metrics.core &&
                metrics.semanticPreservation &&
                metrics.metadataAccuracy &&
                metrics.measurementAccuracy &&
                !metrics.formattingDefect &&
                metrics.noteResolution,
          // Repeated imports may differ in prose, not quantities or component membership.
          latencyMs: Math.round(performance.now() - startedAt),
          modelCalls: telemetry.length,
          failedModelCalls: telemetry.filter(
            (event) => event.outcome && event.outcome !== "succeeded",
          ).length,
          usageComplete: telemetry.every(
            (event) => event.usageAvailable !== false,
          ),
          costEstimateIncomplete: telemetry.some(
            (event) =>
              event.usageAvailable === false || !pricing[event.resolvedModel],
          ),
          fallbackUsed: telemetry.some((event) => event.gatewayFallbackUsed),
          inputTokens: total(telemetry, "inputTokens"),
          outputTokens: total(telemetry, "outputTokens"),
          estimatedCostUsd: telemetry.reduce(
            (sum, event) => sum + estimateCost(event, pricing),
            0,
          ),
        });
        if (!repeatMeasurementsStable) results.at(-1)!.passed = false;
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
          failedModelCalls: telemetry.filter(
            (event) => event.outcome && event.outcome !== "succeeded",
          ).length,
          usageComplete: telemetry.every(
            (event) => event.usageAvailable !== false,
          ),
          costEstimateIncomplete: telemetry.some(
            (event) =>
              event.usageAvailable === false || !pricing[event.resolvedModel],
          ),
          fallbackUsed: telemetry.some((event) => event.gatewayFallbackUsed),
          inputTokens: total(telemetry, "inputTokens"),
          outputTokens: total(telemetry, "outputTokens"),
          estimatedCostUsd: telemetry.reduce(
            (sum, event) => sum + estimateCost(event, pricing),
            0,
          ),
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
      costEstimateIncomplete: results.some(
        (result) => result.costEstimateIncomplete,
      ),
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
  // Summary times are estimates: assess plausibility, not transcription/arithmetic identity.
  const plausibleTime = (
    actual: number | undefined,
    expected: number | undefined,
  ) =>
    expected === undefined ||
    (actual !== undefined &&
      Math.abs(actual - expected) <= Math.max(2, Math.ceil(expected * 0.2)));
  // Identity checks ignore typography only, never missing words or quantities.
  const identity = (value: string) =>
    value
      .normalize("NFKC")
      .toLowerCase()
      .trim()
      .replace(/\s*\/\s*/g, "/")
      .replace(/\s+/g, " ");
  // Cook displays referenced notes alongside steps. Essential details may live
  // there; unrelated/unreferenced notes must not mask a missing method action.
  const method = recipe.steps
    .map((step) =>
      [
        step.text,
        ...(step.noteRefs ?? []).map(
          (id) => recipe.notes?.find((note) => note.id === id)?.text ?? "",
        ),
      ].join("\n"),
    )
    .join("\n");
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
            matches(`^(?:${expected.amount})$`, line.amountText ?? "")) &&
          (!expected.measurement ||
            matchesMeasurement(line, expected.measurement)) &&
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
          (expected.namePattern
            ? matches(expected.namePattern, actual.name)
            : identity(actual.name) === identity(expected.name)) &&
          (expected.amountText === undefined ||
            actual.amountText === expected.amountText),
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
        [...(recipe.notes ?? []).map((note) => note.text), method].join("\n"),
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
      plausibleTime(recipe.prepMinutes, item.expectedPrepMinutes) &&
      plausibleTime(recipe.cookMinutes, item.expectedCookMinutes) &&
      (item.expectedTotalMinutes === undefined ||
        (recipe.prepMinutes !== undefined &&
          recipe.cookMinutes !== undefined &&
          plausibleTime(
            recipe.prepMinutes + recipe.cookMinutes,
            item.expectedTotalMinutes,
          ))) &&
      (!item.expectedPrepRange ||
        (recipe.prepMinutes !== undefined &&
          recipe.prepMinutes >= item.expectedPrepRange[0] &&
          recipe.prepMinutes <= item.expectedPrepRange[1])) &&
      (item.expectedPrepOrigin === undefined ||
        provenance.prepMinutes === item.expectedPrepOrigin) &&
      (item.expectedCookOrigin === undefined ||
        provenance.cookMinutes === item.expectedCookOrigin) &&
      (item.expectedCookOrigins === undefined ||
        (provenance.cookMinutes !== undefined &&
          item.expectedCookOrigins.includes(provenance.cookMinutes))),
    formattingDefect: recipe.ingredients.some((ingredient) =>
      /,\s*,|^(?:g|l|ml|mg)\s/i.test(
        `${ingredient.amountText ?? ""} ${ingredient.name} ${ingredient.note ?? ""}`,
      ),
    ),
    methodCoverage,
    missingMethodPatterns: (item.expectedMethodPatterns ?? []).filter(
      (pattern) => !matches(pattern, method),
    ),
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

/** Compare fixture-selected measurements and grouping, not AI wording or inferred times. */
export function measurementSignature(recipe: RecipeContent, item: CorpusItem) {
  const selectors = [
    ...(item.expectedIngredientPatterns ?? []).map(
      (expected) => (name: string) => new RegExp(expected.name, "i").test(name),
    ),
    ...(item.expectedIngredients ?? []).map(
      (expected) => (name: string) =>
        name.toLowerCase().trim() === expected.name.toLowerCase().trim(),
    ),
    ...(item.expectedIngredientCounts ?? []).map(
      (expected) => (name: string) =>
        expected.namePattern
          ? new RegExp(expected.namePattern, "i").test(name)
          : name.toLowerCase().trim() === expected.name.toLowerCase().trim(),
    ),
  ];
  const rows = selectors.map((select) =>
    recipe.ingredients.filter((line) => select(line.name)),
  );
  return JSON.stringify({
    amounts: rows.map((lines, index) =>
      lines
        .map((line) => ({
          amount:
            item.expectedIngredientPatterns?.[index]?.measurement &&
            matchesMeasurement(
              line,
              item.expectedIngredientPatterns[index].measurement!,
            )
              ? (formatImportAmount(
                  item.expectedIngredientPatterns[index].measurement!,
                ).amountText ?? "")
              : canonicalAmount(
                  line.amountText ??
                    [line.quantity, line.unit].filter(Boolean).join(" "),
                ),
          category: line.shoppingCategory,
        }))
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    ),
    // Only fixture-declared component relationships are release gates. Optional
    // AI-inferred group enrichment is not an authored-source quantity change.
    sameGroups:
      item.expectedIngredientPatterns?.some((expected) => expected.group) ||
      item.expectedIngredientCounts?.some((expected) => expected.distinctGroups)
        ? rows.map((left) =>
            rows.map((right) =>
              left.some((a) =>
                right.some((b) => (a.group ?? "") === (b.group ?? "")),
              ),
            ),
          )
        : [],
  });
}

function matchesMeasurement(
  line: RecipeIngredientLine,
  expected: ImportAmount,
) {
  const amount = (
    line.amountText ?? [line.quantity, line.unit].filter(Boolean).join(" ")
  ).trim();
  if (
    canonicalAmount(amount) ===
    canonicalAmount(formatImportAmount(expected).amountText ?? "")
  )
    return true;
  // A counted identity can carry its noun in the name rather than the amount:
  // "1 clove garlic" and "1 small garlic clove" describe the same quantity.
  // Do not equate bare "1 garlic" with a clove, or accept a different count.
  if (
    expected.kind !== "exact" ||
    !expected.unit ||
    !["clove", "slice", "head", "sprig", "stalk"].includes(expected.unit)
  )
    return false;
  return (
    new RegExp(`\\b${expected.unit}s?\\b`, "i").test(line.name) &&
    amount === formatImportAmount({ ...expected, unit: null }).amountText
  );
}

/** Purchase-container spelling does not change a package count or its size. */
function canonicalAmount(amount: string) {
  return amount
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\b(?:packs?|packets?)\b/g, "packet")
    .replace(/\b(?:tins?|cans?)\b/g, "can");
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
