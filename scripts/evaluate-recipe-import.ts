import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  extractHtmlCandidate,
  extractTextCandidate,
  organiseCandidate,
} from "../convex/lib/recipeImport/pipeline";
import {
  createGatewayRecipeImportModelClient,
  type RecipeImportModelTelemetry,
} from "../convex/lib/recipeImport/models";
import type { RecipeSourceCandidate } from "../convex/lib/recipeImport/source";
import {
  getRecipeReviewIssues,
  type RecipeContent,
} from "../src/lib/domain/recipes";

type CorpusItem = {
  id: string;
  kind: "html" | "text" | "url";
  source?: string;
  fixture?: string;
  expect: "succeeded" | "needs_review" | "failed";
  expectedProtein?: RecipeContent["proteinCategory"];
  expectedServings?: number;
  expectedPrepMinutes?: number;
  expectedCookMinutes?: number;
  minimumIngredients?: number;
  minimumSteps?: number;
  minimumNotes?: number;
};

const fixtureDirectory = resolve(process.cwd(), "tests/fixtures");

async function main() {
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
  const results: Array<Record<string, unknown>> = [];

  for (const item of corpus) {
    if (item.kind === "url") continue; // blocked/unreachable sources are measured separately
    const telemetry: RecipeImportModelTelemetry[] = [];
    const modelClient = createGatewayRecipeImportModelClient((event) =>
      telemetry.push(event),
    );
    const startedAt = performance.now();
    try {
      const candidate = await candidateFor(item);
      const outcome = await organiseCandidate(candidate, modelClient);
      const metrics = score(
        outcome.recipe,
        [
          ...candidate.ingredientLines,
          ...(candidate.method?.steps.map((step) => step.text) ??
            candidate.methodSteps),
        ].join("\n"),
        item,
      );
      results.push({
        case: item.id,
        ...metrics,
        passed:
          item.expect === "failed"
            ? false
            : metrics.core && metrics.metadataAccuracy,
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
        passed: item.expect === "failed",
        core: false,
        hardFailure: true,
        latencyMs: Math.round(performance.now() - startedAt),
        modelCalls: telemetry.length,
        fallbackUsed: telemetry.some((event) => event.gatewayFallbackUsed),
        inputTokens: total(telemetry, "inputTokens"),
        outputTokens: total(telemetry, "outputTokens"),
        error: error instanceof Error ? error.name : "UnknownError",
      });
    }
  }

  console.table(results);
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
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Evaluation failed.");
  process.exitCode = 1;
});

async function candidateFor(item: CorpusItem): Promise<RecipeSourceCandidate> {
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

function score(recipe: RecipeContent, source: string, item: CorpusItem) {
  const rendered = [
    ...recipe.ingredients.flatMap((ingredient) => [
      ingredient.sourceText,
      ingredient.amountText,
      ingredient.quantity,
      ingredient.unit,
      ingredient.name,
      ingredient.note,
    ]),
    ...recipe.steps.flatMap((step) => [step.sourceText, step.text]),
  ]
    .filter(Boolean)
    .join(" ")
    .normalize("NFKC")
    .replace(/⁄/g, "/")
    .toLowerCase();
  const criticalTokens = [
    ...new Set(
      source
        .normalize("NFKC")
        .replace(/⁄/g, "/")
        .toLowerCase()
        .match(/\b(?:\d+(?:[./-]\d+)?|no|not|without|never)\b/g) ?? [],
    ),
  ];
  const steps = recipe.steps.length;
  const core =
    recipe.ingredients.length >= (item.minimumIngredients ?? 1) &&
    steps >= (item.minimumSteps ?? 1);
  return {
    core,
    semanticPreservation: criticalTokens.every((token) =>
      rendered.includes(token),
    ),
    metadataAccuracy:
      (item.expectedProtein === undefined ||
        recipe.proteinCategory === item.expectedProtein) &&
      (item.expectedServings === undefined ||
        recipe.servings === item.expectedServings) &&
      (item.expectedPrepMinutes === undefined ||
        recipe.prepMinutes === item.expectedPrepMinutes) &&
      (item.expectedCookMinutes === undefined ||
        recipe.cookMinutes === item.expectedCookMinutes),
    formattingDefect: recipe.ingredients.some((ingredient) =>
      /\(\s*\(|\)\s*\)|,\s*,|^(?:g|l|ml|mg)\s/i.test(
        `${ingredient.amountText ?? ""} ${ingredient.name} ${ingredient.note ?? ""}`,
      ),
    ),
    methodCoverage: steps >= (item.minimumSteps ?? 1),
    noteResolution:
      item.minimumNotes === undefined ||
      (recipe.notes?.length ?? 0) >= item.minimumNotes,
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
