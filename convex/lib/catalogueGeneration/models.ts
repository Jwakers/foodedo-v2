"use node";
import { generateText, generateImage, Output } from "ai";
import { z } from "zod";
import { timerCuesSchema, uniqueGeneratedTimerIds } from "../recipeTimers";
import { isGenerationTimeout, generationTimeoutMessage } from "./errors";
import {
  PROTEIN_CATEGORIES,
  COST_BANDS,
  SHOPPING_CATEGORIES,
  type RecipeContent,
  type RecipeStep,
} from "../../../src/lib/domain/recipes";
import { canScaleIngredientQuantity } from "../../../src/lib/domain/ingredient-scaling";
import type { EditorialTags } from "../../../src/lib/domain/catalogue-generation";
import type { Doc } from "../../_generated/dataModel";

export const tagsSchema = z.object({
  cuisines: z.array(z.string().max(80)).max(8),
  mealOccasion: z.enum(["lunch", "dinner", "unknown"]),
  cookingMethods: z.array(z.string().max(80)).max(8),
  proteinSource: z.string().max(120),
  carbBase: z.string().max(120),
  flavourProfile: z.array(z.string().max(80)).max(8),
  complexity: z.enum(["simple", "moderate", "complex", "unknown"]),
  vegetarian: z.enum(["yes", "no", "unknown"]),
  vegan: z.enum(["yes", "no", "unknown"]),
});
export const recipeSchema = z.object({
  title: z.string().min(1).max(160),
  description: z.string().min(1).max(1000),
  servings: z.number().int().min(1).max(12),
  minimumServings: z.number().int().min(1).max(12).nullable().optional(),
  prepMinutes: z.number().int().min(0).max(10080),
  cookMinutes: z.number().int().min(0).max(10080),
  proteinCategory: z.enum(PROTEIN_CATEGORIES),
  costBand: z.enum(COST_BANDS),
  ingredients: z
    .array(
      z.object({
        id: z.string().min(1).max(64),
        name: z.string().min(1).max(160),
        quantity: z.string().min(1).max(80),
        unit: z.string().max(48).nullable(),
        note: z.string().max(240).nullable(),
        shoppingCategory: z.enum(SHOPPING_CATEGORIES),
      }),
    )
    .min(2)
    .max(40),
  steps: z
    .array(
      z.object({
        id: z.string().min(1).max(64),
        text: z.string().min(1).max(2000),
        timerCues: timerCuesSchema,
      }),
    )
    .min(2)
    .max(30),
  preheat: z
    .object({
      appliance: z.literal("oven"),
      temperatureC: z.number().int().min(50).max(300),
    })
    .nullable(),
  notes: z
    .array(
      z.object({
        id: z.string().min(1).max(64),
        text: z.string().min(1).max(2000),
      }),
    )
    .max(10),
});
export const authoredSchema = z.object({
  recipe: recipeSchema,
  tags: tagsSchema,
});
export const conceptSchema = z.object({
  concept: z.string().min(1).max(2000),
  rationale: z.string().min(1).max(4000),
});
export const findingSchema = z.object({
  area: z.string().max(80),
  message: z.string().min(1).max(800),
  blocking: z.boolean(),
});
export const reviewSchema = z.object({
  findings: z.array(findingSchema).max(25),
});
export const repairSchema = authoredSchema.extend({
  findings: z.array(findingSchema).max(25),
});
export const enrichmentSchema = z.object({
  rows: z.array(z.object({ key: z.string(), tags: tagsSchema })).max(5),
});
export function recipeContent(
  recipe: z.infer<typeof recipeSchema>,
  previousSteps?: readonly RecipeStep[],
): RecipeContent {
  return {
    ...recipe,
    steps: uniqueGeneratedTimerIds(recipe.steps, previousSteps),
    ingredients: recipe.ingredients.map(({ unit, note, ...line }) => ({
      ...line,
      ...(unit ? { unit } : {}),
      ...(note ? { note } : {}),
    })),
    preheat: recipe.preheat ?? undefined,
    minimumServings: recipe.minimumServings ?? undefined,
    servingScaling: recipe.ingredients.every((line) =>
      canScaleIngredientQuantity(line.quantity),
    )
      ? "safe"
      : "source_only",
  };
}
export type ModelEvent = Doc<"catalogueGenerationRuns">["usage"][number];
export interface GenerationClient {
  text<T>(
    role: string,
    schema: z.ZodType<T>,
    system: string,
    input: unknown,
  ): Promise<T>;
  image(prompt: string): Promise<{ bytes: Uint8Array; mediaType: string }>;
}
function gatewayCost(metadata: unknown): number | undefined {
  if (!metadata || typeof metadata !== "object" || !("gateway" in metadata))
    return undefined;
  const gateway = metadata.gateway;
  if (!gateway || typeof gateway !== "object") return undefined;
  for (const key of ["cost", "gatewayCost"]) {
    const raw = (gateway as Record<string, unknown>)[key];
    if (
      (typeof raw === "number" || typeof raw === "string") &&
      raw !== "" &&
      Number.isFinite(Number(raw)) &&
      Number(raw) >= 0
    )
      return Number(raw);
  }
  return undefined;
}
export function gatewayGenerationClient(
  config: Doc<"catalogueGenerationRuns">["config"],
  deadline: number,
  telemetry: (event: ModelEvent) => Promise<void>,
  onPhase?: (phase: string) => Promise<void>,
): GenerationClient {
  let calls = 0;
  return {
    async text<T>(
      role: string,
      schema: z.ZodType<T>,
      system: string,
      input: unknown,
    ) {
      if (++calls > config.maxTextCalls)
        throw new Error("Model call limit reached.");
      await onPhase?.(role);
      const started = Date.now();
      if (started >= deadline) throw new Error("Generation deadline reached.");
      const configuredTimeout =
        role === "authoring" || role === "targeted_repair"
          ? (config.textCallTimeoutMs ?? 90_000)
          : (config.reviewCallTimeoutMs ?? 90_000);
      const remaining = deadline - Date.now();
      const timeoutMs = Math.max(1, Math.min(configuredTimeout, remaining));
      const signal = AbortSignal.timeout(timeoutMs);
      let event: ModelEvent = {
        role,
        requestedModel: config.textModel,
        resolvedModel: config.textModel,
        durationMs: 0,
        outcome: "failed",
      };
      try {
        const result = await generateText({
          model: config.textModel,
          maxRetries: 0,
          maxOutputTokens: config.maxOutputTokens,
          abortSignal: signal,
          system,
          prompt: JSON.stringify(input),
          output: Output.object({ schema }),
          providerOptions: {
            openai: {
              reasoningEffort:
                role === "selection"
                  ? (config.selectionReasoningEffort ?? config.reasoningEffort)
                  : config.reasoningEffort,
            },
          },
        });
        event = {
          ...event,
          resolvedModel: result.response.modelId,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          costUsd: gatewayCost(result.providerMetadata),
        };
        const output = schema.parse(result.output);
        event.outcome = "succeeded";
        return output;
      } catch (error) {
        if (signal.aborted || isGenerationTimeout(error)) {
          event.outcome = "timed_out";
          throw new Error(
            generationTimeoutMessage(
              role,
              timeoutMs,
              signal.aborted,
              remaining < configuredTimeout,
            ),
            { cause: error },
          );
        }
        throw error;
      } finally {
        event.durationMs = Date.now() - started;
        await telemetry(event);
      }
    },
    async image(prompt) {
      await onPhase?.("photography");
      const started = Date.now();
      if (started >= deadline) throw new Error("Generation deadline reached.");
      let event: ModelEvent = {
        role: "photography",
        requestedModel: config.imageModel,
        resolvedModel: config.imageModel,
        durationMs: 0,
        outcome: "failed",
      };
      try {
        // Gemini's native image models use multimodal generateText, not the
        // dedicated image-model endpoint used by historical GPT Image runs.
        if (config.imageModel.startsWith("google/gemini-")) {
          const result = await generateText({
            model: config.imageModel,
            prompt,
            maxRetries: 0,
            abortSignal: AbortSignal.timeout(
              Math.max(1, Math.min(240_000, deadline - Date.now())),
            ),
            providerOptions: {
              google: {
                responseModalities: ["IMAGE"],
                imageConfig: {
                  aspectRatio: "16:9",
                  imageSize: config.imageSize ?? "2K",
                },
              },
            },
          });
          event = {
            ...event,
            resolvedModel: result.response.modelId,
            inputTokens: result.usage.inputTokens,
            outputTokens: result.usage.outputTokens,
            costUsd: gatewayCost(result.providerMetadata),
          };
          const images = result.files.filter((file) =>
            file.mediaType.startsWith("image/"),
          );
          if (images.length !== 1)
            throw new Error(
              "Image provider must return exactly one photograph.",
            );
          event.outcome = "succeeded";
          return {
            bytes: images[0].uint8Array,
            mediaType: images[0].mediaType,
          };
        }
        const result = await generateImage({
          model: config.imageModel,
          n: 1,
          prompt,
          ...(config.imageSize
            ? { size: config.imageSize as `${number}x${number}` }
            : { aspectRatio: "16:9" as const }),
          ...(config.imageQuality
            ? { providerOptions: { openai: { quality: config.imageQuality } } }
            : {}),
          maxRetries: 0,
          abortSignal: AbortSignal.timeout(
            Math.max(1, Math.min(240_000, deadline - Date.now())),
          ),
        });
        if (!result.image) throw new Error("Image provider returned no image.");
        event = {
          ...event,
          costUsd: gatewayCost(result.providerMetadata),
          outcome: "succeeded",
        };
        return {
          bytes: result.image.uint8Array,
          mediaType: result.image.mediaType,
        };
      } finally {
        event.durationMs = Date.now() - started;
        await telemetry(event);
      }
    },
  };
}
export type Authored = {
  recipe: z.infer<typeof recipeSchema>;
  tags: EditorialTags;
};

// Revisions additionally retain note links and section grouping.
const revisionIngredient = recipeSchema.shape.ingredients.element.extend({
  group: z.string().max(160).nullable(),
  noteRefs: z.array(z.string().max(64)).max(10),
});
const revisionStep = recipeSchema.shape.steps.element.extend({
  group: z.string().max(160).nullable(),
  noteRefs: z.array(z.string().max(64)).max(10),
});
export const revisionRecipeSchema = recipeSchema.extend({
  ingredients: z.array(revisionIngredient).min(2).max(40),
  steps: z.array(revisionStep).min(2).max(30),
  notes: z
    .array(
      recipeSchema.shape.notes.element.extend({
        label: z.string().max(160).nullable(),
      }),
    )
    .max(10),
});
export const revisionSchema = z.object({
  recipe: revisionRecipeSchema,
  tags: tagsSchema,
  changeSummary: z.array(z.string().min(1).max(400)).max(12),
});
export const revisionRepairSchema = revisionSchema.extend({
  findings: z.array(findingSchema).max(25),
});

export function revisedRecipeContent(
  recipe: z.infer<typeof revisionRecipeSchema>,
  previousSteps?: readonly RecipeStep[],
): RecipeContent {
  const content = recipeContent(recipe, previousSteps);
  return {
    ...content,
    ingredients: recipe.ingredients.map(
      ({ group, noteRefs, unit, note, ...line }) => ({
        ...line,
        ...(group ? { group } : {}),
        ...(noteRefs.length ? { noteRefs } : {}),
        ...(unit ? { unit } : {}),
        ...(note ? { note } : {}),
      }),
    ),
    steps: content.steps.map(({ group, noteRefs, timerCues, ...step }) => ({
      ...step,
      ...(group ? { group } : {}),
      ...(noteRefs?.length ? { noteRefs } : {}),
      ...(timerCues?.length ? { timerCues } : {}),
    })),
    notes: recipe.notes.map(({ label, ...note }) => ({
      ...note,
      ...(label ? { label } : {}),
    })),
  };
}
