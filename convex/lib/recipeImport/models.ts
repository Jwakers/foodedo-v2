"use node";
import {
  JSONParseError,
  NoContentGeneratedError,
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  Output,
  TypeValidationError,
  generateText,
  type LanguageModelUsage,
} from "ai";
import { z } from "zod";
import { ImportFailure, invalidModelOutput } from "./contracts";
import { amountSchema } from "./measurements";

export const importIssueSchema = z.object({
  area: z.enum(["ingredients", "method", "metadata", "notes"]),
  code: z
    .enum([
      "ambiguous",
      "unresolved_reference",
      "source_conflict",
      "partial_coverage",
    ])
    .describe(
      "partial_coverage means essential content genuinely absent from the source, not an omission you can correct from supplied evidence. Use source_conflict or ambiguous for substantial recoverable uncertainty.",
    ),
  targetId: z.string().max(80).nullable(),
  message: z.string().min(1).max(400),
  blocking: z
    .boolean()
    .describe(
      "True ONLY for unavailable essential ingredients or unusable/unsafe essential cooking instructions. Metadata is NEVER blocking.",
    ),
});
export type ImportIssue = z.infer<typeof importIssueSchema>;
const refs = z.array(z.string().regex(/^B\d{1,7}$/)).max(24);
const origin = z.enum(["published", "derived", "estimated"]);
const metadata = z
  .object({
    value: z.number().int().min(0).max(10080),
    origin,
    sourceIds: refs,
  })
  .nullable();
export const importedRecipeSchema = z.object({
  title: z.string().min(1).max(160),
  titleSourceIds: refs,
  description: z.string().max(1000).nullable(),
  servings: z
    .object({
      value: z.number().int().min(1).max(1000),
      origin,
      sourceIds: refs,
    })
    .nullable(),
  prepMinutes: metadata,
  cookMinutes: metadata,
  proteinCategory: z.enum([
    "chicken",
    "beef",
    "pork",
    "lamb",
    "fish",
    "meat-free",
    "other",
  ]),
  ingredients: z
    .array(
      z.object({
        sourceIds: refs,
        name: z.string().min(1).max(160),
        amount: amountSchema,
        note: z.string().max(240).nullable(),
        group: z.string().max(120).nullable(),
        noteRefs: z.array(z.string().regex(/^note-\d+$/)).max(12),
        shoppingCategory: z.enum([
          "fruit_and_veg",
          "meat_and_fish",
          "dairy_and_eggs",
          "pantry",
          "bakery",
          "other",
        ]),
      }),
    )
    .max(100),
  steps: z
    .array(
      z.object({
        sourceIds: refs,
        text: z.string().min(1).max(2000),
        group: z.string().max(120).nullable(),
        noteRefs: z.array(z.string().regex(/^note-\d+$/)).max(12),
      }),
    )
    .max(100),
  notes: z
    .array(
      z.object({
        id: z.string().regex(/^note-\d+$/),
        sourceIds: refs,
        label: z.string().max(120).nullable(),
        text: z.string().min(1).max(2000),
      }),
    )
    .max(100),
});
export const importOutputSchema = z.object({
  result: z.union([
    z.object({
      status: z.literal("recipe"),
      recipe: importedRecipeSchema,
      issues: z.array(importIssueSchema).max(30),
    }),
    z.object({ status: z.literal("no_recipe") }),
  ]),
});

export type ImportedRecipe = z.infer<typeof importedRecipeSchema>;
export type ImportOutput = z.infer<typeof importOutputSchema>;
// A correction replaces metadata or edits affected rows. Empty changes preserve every
// original field, including typed amounts and provenance, without regenerating it.
const fields = importedRecipeSchema.shape;
function rowEdits<T extends z.ZodType>(row: T) {
  return z
    .array(
      z.object({
        start: z
          .number()
          .int()
          .min(0)
          .max(100)
          .describe(
            "Zero-based position in the ORIGINAL proposed section; length means append.",
          ),
        remove: z
          .number()
          .int()
          .min(0)
          .max(100)
          .describe(
            "Number of original rows replaced or deleted; zero inserts.",
          ),
        items: z.array(row).max(100),
      }),
    )
    .max(30);
}
export const correctionOutputSchema = z.object({
  sourceStatus: z
    .enum(["recipe", "no_recipe"])
    .describe(
      "no_recipe only when the source is genuinely unrelated, not an incomplete recognizable recipe.",
    ),
  changes: z
    .array(
      z.union([
        z.object({ field: z.literal("title"), value: fields.title }),
        z.object({
          field: z.literal("titleSourceIds"),
          value: fields.titleSourceIds,
        }),
        z.object({
          field: z.literal("description"),
          value: fields.description,
        }),
        z.object({ field: z.literal("servings"), value: fields.servings }),
        z.object({
          field: z.literal("prepMinutes"),
          value: fields.prepMinutes,
        }),
        z.object({
          field: z.literal("cookMinutes"),
          value: fields.cookMinutes,
        }),
        z.object({
          field: z.literal("proteinCategory"),
          value: fields.proteinCategory,
        }),
        z.object({
          field: z.literal("ingredients"),
          value: rowEdits(fields.ingredients.element),
        }),
        z.object({
          field: z.literal("steps"),
          value: rowEdits(fields.steps.element),
        }),
        z.object({
          field: z.literal("notes"),
          value: rowEdits(fields.notes.element),
        }),
      ]),
    )
    .max(10),
  issues: z.array(importIssueSchema).max(30),
});
export type ImportCorrection = z.infer<typeof correctionOutputSchema>;
export const recipeImportModels = {
  normalize: "openai/gpt-5.4",
  correct: "openai/gpt-5.4",
  recover: "openai/gpt-5.4",
  reasoningEffort: "low",
} as const;

export {
  NORMALIZATION_PROMPT,
  CORRECTION_PROMPT,
  RECOVERY_PROMPT,
} from "./prompts";
export type StructuredModelTask<T> = {
  role: string;
  primaryModel: string;
  schema: z.ZodType<T>;
  system: string;
  prompt: string;
  deadline?: number;
};

export interface RecipeImportModelClient {
  generate<T>(task: StructuredModelTask<T>): Promise<T>;
}

export type RecipeImportModelTelemetry = {
  role: string;
  requestedModel: string;
  resolvedModel: string;
  provider: string;
  durationMs: number;
  inputTokens: number | undefined;
  outputTokens: number | undefined;
  reasoningTokens?: number;
  reasoningEffort?: "low" | "none";
  gatewayFallbackUsed: boolean;
  outcome?:
    "succeeded" | "invalid_model_output" | "ai_unavailable" | "timed_out";
  usageAvailable?: boolean;
};

export function createGatewayRecipeImportModelClient(
  onTelemetry?: (telemetry: RecipeImportModelTelemetry) => void,
  run: typeof generateText = generateText,
): RecipeImportModelClient {
  return {
    async generate<T>({
      role,
      primaryModel,
      schema,
      system,
      prompt,
      deadline,
    }: StructuredModelTask<T>) {
      const startedAt = Date.now();
      let result: Awaited<ReturnType<typeof generateText>> | undefined;
      let output: T;
      let outcome: NonNullable<RecipeImportModelTelemetry["outcome"]> =
        "succeeded";
      let failedUsage: LanguageModelUsage | undefined;
      try {
        result = await run({
          model: primaryModel,
          maxRetries: 0,
          abortSignal: AbortSignal.timeout(
            Math.max(1, (deadline ?? Date.now() + 90_000) - Date.now()),
          ),
          system,
          prompt,
          output: Output.object({ schema, name: `recipe_import_${role}` }),
          providerOptions: {
            openai: {
              reasoningEffort: recipeImportModels.reasoningEffort,
            },
          },
        });
        output = schema.parse(result.output);
      } catch (error) {
        if (NoObjectGeneratedError.isInstance(error)) failedUsage = error.usage;
        if (deadline !== undefined && Date.now() >= deadline) {
          outcome = "timed_out";
          throw new ImportFailure(
            "timed_out",
            "Recipe processing deadline reached.",
          );
        }
        if (
          error instanceof TypeValidationError ||
          error instanceof JSONParseError ||
          error instanceof NoContentGeneratedError ||
          NoObjectGeneratedError.isInstance(error) ||
          NoOutputGeneratedError.isInstance(error) ||
          error instanceof z.ZodError
        ) {
          outcome = "invalid_model_output";
          throw invalidModelOutput(
            `${role} returned an invalid structured result.`,
            structuredFindings(error),
          );
        }
        outcome = "ai_unavailable";
        throw new ImportFailure(
          "ai_unavailable",
          error instanceof Error ? error.message : "AI task failed.",
        );
      } finally {
        const usage = result?.usage ?? failedUsage;
        const resolvedModel = result?.response.modelId || primaryModel;
        const telemetry = {
          role,
          requestedModel: primaryModel,
          resolvedModel,
          provider: resolvedModel.split("/")[0] ?? "unknown",
          durationMs: Date.now() - startedAt,
          inputTokens: usage?.inputTokens,
          outputTokens: usage?.outputTokens,
          reasoningTokens: usage?.outputTokenDetails?.reasoningTokens,
          reasoningEffort: recipeImportModels.reasoningEffort,
          gatewayFallbackUsed: resolvedModel !== primaryModel,
          outcome,
          usageAvailable:
            usage?.inputTokens !== undefined &&
            usage?.outputTokens !== undefined,
        } satisfies RecipeImportModelTelemetry;
        if (!onTelemetry) console.info("recipe_import_model_task", telemetry);
        // Observability must never turn a valid recipe into a failed import.
        try {
          onTelemetry?.(telemetry);
        } catch {
          /* Observer failure is non-fatal. */
        }
      }
      return output;
    },
  };
}

function structuredFindings(
  error: unknown,
): Array<{ path: string; code: string }> {
  if (error instanceof z.ZodError)
    return error.issues.slice(0, 12).map((issue) => ({
      path: issue.path
        .map((part) => String(part).slice(0, 80))
        .join(".")
        .slice(0, 240),
      code: issue.code,
    }));
  if (error instanceof TypeValidationError)
    return structuredFindings(error.cause);
  if (NoObjectGeneratedError.isInstance(error))
    return structuredFindings(error.cause);
  return [{ path: "response", code: "invalid_structured_output" }];
}

export const gatewayRecipeImportModelClient =
  createGatewayRecipeImportModelClient();
