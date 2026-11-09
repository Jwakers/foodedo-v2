"use node";
import { generateText } from "ai";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { acquireRecipeSource } from "./lib/recipeImport/sources";
import {
  isApifySocialPlatform,
  socialImportPlatform,
} from "../src/lib/domain/social-import";
import { SocialAcquisitionFailure } from "./lib/recipeImport/apify";
import { containsFact, verifyRecipe } from "./lib/recipeImport/evaluation";
import { organiseCandidate } from "./lib/recipeImport/extraction";
import { createGatewayRecipeImportModelClient } from "./lib/recipeImport/models";
import { ImportFailure } from "./lib/recipeImport/contracts";

/** Internal, bounded acquisition probe: tests the real runtime without saving a recipe. */
export const probe = internalAction({
  args: {
    url: v.string(),
    expectedFragments: v.array(v.string()),
    normalize: v.optional(v.boolean()),
    verification: v.optional(
      v.object({
        minimumIngredients: v.number(),
        minimumSteps: v.number(),
        ingredients: v.array(
          v.object({
            name: v.string(),
            aliases: v.optional(v.array(v.string())),
            amounts: v.array(v.string()),
          }),
        ),
        methodFacts: v.array(v.string()),
        methodAlternatives: v.optional(v.array(v.array(v.string()))),
      }),
    ),
  },
  returns: v.object({
    acquired: v.boolean(),
    latencyMs: v.number(),
    outcome: v.optional(v.string()),
    extractor: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    textCharacters: v.optional(v.number()),
    missingFragments: v.optional(v.array(v.string())),
    mediaType: v.optional(v.string()),
    normalization: v.optional(
      v.object({
        outcome: v.string(),
        usable: v.boolean(),
        verified: v.boolean(),
        missingFacts: v.array(v.string()),
        ingredients: v.optional(v.number()),
        steps: v.optional(v.number()),
        blockingIssues: v.optional(v.number()),
        modelCalls: v.number(),
        inputTokens: v.number(),
        outputTokens: v.number(),
        usageComplete: v.boolean(),
        latencyMs: v.number(),
      }),
    ),
  }),
  handler: async (_, { url, expectedFragments, normalize, verification }) => {
    if (
      !isApifySocialPlatform(socialImportPlatform(url)) ||
      url.length > 2048 ||
      expectedFragments.length > 32 ||
      expectedFragments.some((value) => !value || value.length > 160)
    )
      throw new Error("Invalid evaluation case.");
    if (
      verification &&
      (verification.minimumIngredients < 1 ||
        verification.minimumIngredients > 100 ||
        verification.minimumSteps < 1 ||
        verification.minimumSteps > 100 ||
        verification.ingredients.length > 30 ||
        verification.methodFacts.length > 30 ||
        [
          ...verification.ingredients.flatMap((x) => [x.name, ...x.amounts]),
          ...verification.methodFacts,
        ].some((x) => !x || x.length > 160))
    )
      throw new Error("Invalid recipe verification.");
    const started = Date.now();
    try {
      const candidate = await acquireRecipeSource({ type: "url", url });
      const acquisition = {
        acquired: true,
        latencyMs: Date.now() - started,
        extractor: candidate.extractor,
        sourceUrl: candidate.sourceUrl,
        textCharacters: candidate.sourceText.length,
        missingFragments: expectedFragments.filter(
          (fragment) => !containsFact(candidate.sourceText, fragment),
        ),
        ...(candidate.socialEvidence?.mediaType
          ? { mediaType: candidate.socialEvidence.mediaType }
          : {}),
      };
      if (!normalize) return acquisition;
      let modelCalls = 0;
      let inputTokens = 0;
      let outputTokens = 0;
      let usageComplete = true;
      const model = createGatewayRecipeImportModelClient(
        (event) => {
          modelCalls++;
          if (
            event.inputTokens === undefined ||
            event.outputTokens === undefined
          )
            usageComplete = false;
          inputTokens += event.inputTokens ?? 0;
          outputTokens += event.outputTokens ?? 0;
        },
        generateText,
        { maxOutputTokens: 6_000 },
      );
      try {
        const result = await organiseCandidate(
          candidate,
          model,
          Math.min(started + 165_000, Date.now() + 110_000),
        );
        const missingFacts = verification
          ? verifyRecipe(result.recipe, verification)
          : [];
        return {
          ...acquisition,
          normalization: {
            outcome: result.status,
            usable: result.status === "usable",
            verified: verification !== undefined && missingFacts.length === 0,
            missingFacts,
            ingredients: result.recipe.ingredients.length,
            steps: result.recipe.steps.length,
            blockingIssues: result.issues.filter((x) => x.blocking).length,
            modelCalls,
            inputTokens,
            outputTokens,
            usageComplete,
            latencyMs: Date.now() - started,
          },
        };
      } catch (error) {
        return {
          ...acquisition,
          normalization: {
            outcome: error instanceof ImportFailure ? error.code : "internal",
            usable: false,
            verified: false,
            missingFacts: [],
            modelCalls,
            inputTokens,
            outputTokens,
            usageComplete,
            latencyMs: Date.now() - started,
          },
        };
      }
    } catch (error) {
      return {
        acquired: false,
        latencyMs: Date.now() - started,
        outcome:
          error instanceof SocialAcquisitionFailure
            ? error.acquisitionOutcome
            : error instanceof ImportFailure
              ? error.code
              : "internal",
      };
    }
  },
});
