"use node";

import {
  JSONParseError,
  NoContentGeneratedError,
  Output,
  TypeValidationError,
  generateText,
} from "ai";
import { z } from "zod";

import { ImportFailure, RECIPE_IMPORT_LIMITS } from "./contracts";

const shoppingCategorySchema = z.enum([
  "fruit_and_veg",
  "meat_and_fish",
  "dairy_and_eggs",
  "pantry",
  "bakery",
  "other",
]);
const metadataOriginSchema = z.enum(["published", "derived", "estimated"]);
const evidenceIdsSchema = z.array(z.string().min(1).max(32)).min(1).max(24);
const metadataFieldSchema = z
  .object({
    value: z.number().int().min(0).max(10_080),
    origin: metadataOriginSchema,
    evidenceIds: evidenceIdsSchema,
  })
  .nullable();

export const holisticOutputSchema = z.object({
  isRecipe: z.boolean(),
  title: z.string().min(1).max(160),
  description: z.string().max(1_000).nullable(),
  titleEvidenceIds: evidenceIdsSchema,
  servings: z
    .object({
      value: z.number().int().min(1).max(1_000),
      origin: metadataOriginSchema,
      evidenceIds: evidenceIdsSchema,
    })
    .nullable(),
  prepMinutes: metadataFieldSchema,
  cookMinutes: metadataFieldSchema,
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
        sourceIds: evidenceIdsSchema,
        name: z.string().min(1).max(160),
        quantity: z.string().max(80).nullable(),
        unit: z.string().max(48).nullable(),
        note: z.string().max(240).nullable(),
        amountText: z.string().max(120).nullable(),
        group: z.string().max(120).nullable(),
        noteRefs: z.array(z.string().max(64)).max(12),
        shoppingCategory: shoppingCategorySchema,
      }),
    )
    .min(1)
    .max(100),
  excludedIngredientSourceIds: z.array(z.string().min(1).max(32)).max(100),
  method: z.object({
    steps: z
      .array(
        z.object({
          sourceIds: evidenceIdsSchema,
          text: z.string().min(1).max(2_000),
          group: z.string().max(120).nullable(),
          noteRefs: z.array(z.string().max(64)).max(12),
        }),
      )
      .min(1)
      .max(100),
  }),
  excludedInstructionSourceIds: z.array(z.string().min(1).max(32)).max(100),
  notes: z
    .array(
      z.object({
        sourceIds: evidenceIdsSchema,
        label: z.string().max(120).nullable(),
        text: z.string().min(1).max(2_000),
      }),
    )
    .max(100),
});

export const holisticIngredientsRepairSchema = holisticOutputSchema.pick({
  ingredients: true,
  excludedIngredientSourceIds: true,
});
export const holisticMethodRepairSchema = holisticOutputSchema.pick({
  method: true,
  excludedInstructionSourceIds: true,
});
export const holisticMetadataRepairSchema = holisticOutputSchema.pick({
  title: true,
  description: true,
  titleEvidenceIds: true,
  servings: true,
  prepMinutes: true,
  cookMinutes: true,
  proteinCategory: true,
});

export type HolisticOutput = z.infer<typeof holisticOutputSchema>;
export type HolisticValidationArea =
  "ingredients" | "method" | "notes" | "metadata";

export const recipeImportModels = {
  ingredients: "google/gemini-3-flash",
  method: "anthropic/claude-haiku-4.5",
  metadata: "openai/gpt-5.4-nano",
  holistic: "openai/gpt-5.4-mini",
  repair: "openai/gpt-5.4-mini",
} as const;

const gatewayFallbackModels = ["openai/gpt-5.4-mini"] as const;

export type StructuredModelTask<T> = {
  role: string;
  primaryModel: string;
  schema: z.ZodType<T>;
  system: string;
  prompt: string;
  validate?: (output: T) => boolean;
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
  gatewayFallbackUsed: boolean;
};

export function createGatewayRecipeImportModelClient(
  onTelemetry?: (telemetry: RecipeImportModelTelemetry) => void,
): RecipeImportModelClient {
  return {
    async generate<T>({
      role,
      primaryModel,
      schema,
      system,
      prompt,
      validate,
    }: StructuredModelTask<T>) {
      const startedAt = Date.now();
      let result: Awaited<ReturnType<typeof generateText>>;
      try {
        result = await generateText({
          model: primaryModel,
          system,
          prompt: prompt.slice(0, RECIPE_IMPORT_LIMITS.modelSourceCharacters),
          output: Output.object({ schema, name: `recipe_import_${role}` }),
          providerOptions: {
            gateway: { models: [...gatewayFallbackModels] },
          },
        });
      } catch (error) {
        if (
          error instanceof TypeValidationError ||
          error instanceof JSONParseError ||
          error instanceof NoContentGeneratedError
        ) {
          throw new ImportFailure(
            "unsafe_result",
            `${role} returned an invalid structured result.`,
            ["contract"],
          );
        }
        throw new ImportFailure(
          "ai_unavailable",
          error instanceof Error ? error.message : "AI task failed.",
        );
      }
      if (validate && !validate(result.output as T)) {
        throw new ImportFailure(
          "unsafe_result",
          `${role} output failed deterministic validation.`,
          ["contract"],
        );
      }
      const resolvedModel = result.response.modelId || primaryModel;
      const telemetry = {
        role,
        requestedModel: primaryModel,
        resolvedModel,
        provider: resolvedModel.split("/")[0] ?? "unknown",
        durationMs: Date.now() - startedAt,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        gatewayFallbackUsed: resolvedModel !== primaryModel,
      } satisfies RecipeImportModelTelemetry;
      console.info("recipe_import_model_task", telemetry);
      onTelemetry?.(telemetry);
      return result.output as T;
    },
  };
}

export const gatewayRecipeImportModelClient =
  createGatewayRecipeImportModelClient();
