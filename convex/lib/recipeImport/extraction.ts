"use node";

import { z } from "zod";
import { prepareRecipeContent } from "../../../src/lib/domain/recipes";
import {
  normalizeDraftIssues,
  requiredDraftIssues,
} from "../../../src/lib/domain/recipe-import-draft";
import { ImportFailure } from "./contracts";
import {
  NORMALIZATION_PROMPT,
  CORRECTION_PROMPT,
  RECOVERY_PROMPT,
  gatewayRecipeImportModelClient,
  importOutputSchema,
  correctionOutputSchema,
  recipeImportModels,
  type ImportOutput,
  type RecipeImportModelClient,
} from "./models";
import { serializeRecipeEvidence, type RecipeSourceCandidate } from "./source";
import {
  recipeForCorrection,
  toRecipeContent,
  unresolvedMethodNoteIssues,
} from "./validation";
import { applyRecipeCorrections } from "./corrections";

/** One coherent recipe, corrected once; a single shared recovery budget, never a veto loop. */
export async function organiseCandidate(
  source: RecipeSourceCandidate,
  client: RecipeImportModelClient = gatewayRecipeImportModelClient,
  deadline = Date.now() + 100_000,
) {
  const evidence = serializeRecipeEvidence(source);
  let calls = 0;
  let output: ImportOutput | undefined;
  let recoveryUsed = false;

  async function generate(
    role: "normalize" | "correct" | "recover",
    feedback = "",
  ) {
    if (Date.now() >= deadline)
      throw new ImportFailure(
        "timed_out",
        "Recipe processing deadline reached.",
      );
    if (++calls > 3)
      throw new ImportFailure(
        "invalid_model_output",
        "Model recovery budget exhausted.",
      );
    const prompt =
      evidence +
      (output?.result.status === "recipe"
        ? `\nPROPOSED RECIPE\n${JSON.stringify(recipeForCorrection(output.result.recipe))}\nPROPOSED ISSUES\n${JSON.stringify(output.result.issues)}`
        : "") +
      feedback;
    if (role === "correct" && output?.result.status === "recipe") {
      const correction = correctionOutputSchema.parse(
        await client.generate({
          role,
          primaryModel: recipeImportModels.correct,
          schema: correctionOutputSchema,
          system: CORRECTION_PROMPT,
          deadline,
          prompt,
        }),
      );
      if (correction.sourceStatus === "no_recipe")
        return { result: { status: "no_recipe" as const } };
      return {
        result: {
          status: "recipe" as const,
          recipe: applyRecipeCorrections(output.result.recipe, correction),
          issues: correction.issues,
        },
      };
    }
    return importOutputSchema.parse(
      await client.generate({
        role,
        primaryModel: recipeImportModels[role],
        schema: importOutputSchema,
        system:
          role === "normalize"
            ? NORMALIZATION_PROMPT
            : role === "correct"
              ? CORRECTION_PROMPT
              : RECOVERY_PROMPT,
        deadline,
        prompt,
      }),
    );
  }
  async function withRecovery(role: "normalize" | "correct") {
    try {
      return await generate(role);
    } catch (error) {
      if (!isMalformed(error) || recoveryUsed || calls >= 3) throw error;
      recoveryUsed = true;
      return await generate(
        "recover",
        `\nReturn a complete response matching the schema; retain recovered content and identify missing essential content.\nCONTRACT FINDINGS\n${JSON.stringify(contractFindings(error))}`,
      );
    }
  }

  output = await withRecovery("normalize");
  if (output.result.status === "no_recipe")
    throw new ImportFailure("no_recipe", "No recipe was found.");
  output = await withRecovery("correct");

  for (;;) {
    if (output.result.status === "no_recipe")
      throw new ImportFailure("no_recipe", "No recipe was found.");
    let structuralError: string | undefined;
    let converted: ReturnType<typeof toRecipeContent> | undefined;
    try {
      const recipe = output.result.recipe;
      if (
        recipe.ingredients.some(
          (line) =>
            line.amount.kind === "range" &&
            line.amount.lower > line.amount.upper,
        )
      ) {
        throw new Error("A quantity range must be ordered lower to upper.");
      }
      converted = toRecipeContent(recipe, source);
    } catch (error) {
      structuralError =
        error instanceof Error ? error.message : "Invalid recipe shape.";
    }
    // Reserve space for locally detected missing core content; optional advice
    // must neither crowd out essential issues nor exceed persistence bounds.
    const issues = [
      ...(converted ? requiredDraftIssues(converted.recipe) : []),
      ...unresolvedMethodNoteIssues(output.result.recipe, output.result.issues),
      ...normalizeDraftIssues(output.result.issues),
    ]
      .sort((left, right) => Number(right.blocking) - Number(left.blocking))
      .slice(0, 30);
    if (
      // The checker already used the same complete context. Confirmed source
      // gaps need new user input, not another attempt to invent missing content.
      (structuralError ||
        issues.some(
          (issue) => issue.blocking && issue.code !== "partial_coverage",
        )) &&
      !recoveryUsed &&
      calls < 3
    ) {
      recoveryUsed = true;
      output = await generate(
        "recover",
        `\nRECOVERY ISSUES\n${JSON.stringify({ structuralError, issues })}`,
      );
      continue;
    }
    if (!converted)
      throw new ImportFailure(
        "invalid_model_output",
        "AI could not produce bounded recipe content.",
        ["contract"],
      );
    const blocking = issues.some((issue) => issue.blocking);
    const normalizationWarnings = [
      ...converted.normalizationWarnings,
      ...issues.map(({ area, code, targetId }) => ({
        area,
        code,
        ...(targetId ? { targetId } : {}),
      })),
    ].slice(0, 100);
    return {
      ...converted,
      recipe: blocking
        ? converted.recipe
        : prepareRecipeContent(converted.recipe),
      normalizationWarnings,
      status: blocking ? ("draft" as const) : ("usable" as const),
      issues,
    };
  }
}

function isMalformed(error: unknown) {
  return (
    error instanceof z.ZodError ||
    (error instanceof ImportFailure && error.code === "invalid_model_output")
  );
}

function contractFindings(error: unknown) {
  if (error instanceof z.ZodError)
    return error.issues
      .slice(0, 12)
      .map((issue) => ({ path: issue.path.join("."), code: issue.code }));
  if (error instanceof ImportFailure)
    return (
      error.validationFindings ?? [
        { path: "response", code: "invalid_structured_output" },
      ]
    );
  return [{ path: "response", code: "invalid_structured_output" }];
}
