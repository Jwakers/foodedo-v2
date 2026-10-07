"use node";

import { ImportFailure } from "./contracts";
import {
  EXTRACTION_PROMPT,
  VERIFICATION_PROMPT,
  gatewayRecipeImportModelClient,
  importOutputSchema,
  verificationSchema,
  recipeImportModels,
  type ImportedRecipe,
  type ImportFinding,
  type RecipeImportModelClient,
} from "./models";
import { serializeRecipeEvidence, type RecipeSourceCandidate } from "./source";
import {
  recipeForVerification,
  toRecipeContent,
  validateImportedRecipe,
  requiredMeasurementConfirmations,
  validateMeasurementConfirmations,
} from "./validation";

/** Two whole-recipe attempts, each independently verified. No parser or source-shaped fallback. */
export async function organiseCandidate(
  source: RecipeSourceCandidate,
  client: RecipeImportModelClient = gatewayRecipeImportModelClient,
  deadline = Date.now() + 100_000,
) {
  const evidence = serializeRecipeEvidence(source);
  let findings: ImportFinding[] = [];
  let rejected: ImportedRecipe | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (Date.now() >= deadline)
      throw new ImportFailure(
        "timed_out",
        "Recipe processing deadline reached.",
      );
    try {
      const output = importOutputSchema.parse(
        await client.generate({
          role: attempt === 0 ? "extract" : "repair",
          primaryModel: recipeImportModels.primary,
          schema: importOutputSchema,
          system: EXTRACTION_PROMPT,
          deadline,
          prompt:
            evidence +
            (attempt
              ? `\nREPAIR FINDINGS\n${JSON.stringify(findings)}\nPREVIOUS RECIPE\n${JSON.stringify(rejected ?? null)}`
              : ""),
        }),
      );
      if (output.result.status === "no_recipe")
        throw new ImportFailure("no_recipe", "No recipe was found.");
      if (output.result.status === "incomplete_recipe") {
        const audit = verificationSchema.parse(
          await client.generate({
            role: "verify",
            primaryModel: recipeImportModels.primary,
            schema: verificationSchema,
            system: VERIFICATION_PROMPT,
            deadline,
            prompt: `${evidence}\nAUDIT INCOMPLETE_RECIPE ASSESSMENT\n${JSON.stringify(output.result)}`,
          }),
        );
        findings = audit.findings.filter(
          (finding) =>
            (finding.area === "ingredients" || finding.area === "method") &&
            finding.code === "omission",
        );
        if (attempt === 1 && findings.length)
          throw new ImportFailure(
            "incomplete_recipe",
            "Essential recipe content is unavailable.",
            [...new Set(findings.map((finding) => finding.area))],
            [
              ...new Set(findings.flatMap((finding) => finding.sourceIds)),
            ].slice(0, 24),
            ["omission"],
          );
        if (!findings.length)
          findings = [
            {
              area: "contract",
              code: "formatting",
              sourceIds: output.result.sourceIds,
              detail:
                "The independent audit did not confirm missing essential content. Extract the available ingredients and method. Suggest missing pasted-text title/description; leave unknown optional metadata null.",
            },
          ];
        continue;
      }
      rejected = output.result.recipe;
      findings = validateImportedRecipe(rejected, source);
      const required = requiredMeasurementConfirmations(rejected, source);
      // Audit even when deterministic findings exist, so repair receives all defects together.
      const audit = verificationSchema.parse(
        await client.generate({
          role: "verify",
          primaryModel: recipeImportModels.primary,
          schema: verificationSchema,
          system: VERIFICATION_PROMPT,
          deadline,
          prompt: `${evidence}\nPROPOSED NORMALIZED RECIPE\n${JSON.stringify(recipeForVerification(rejected))}\nREQUIRED MEASUREMENT CONFIRMATIONS\n${JSON.stringify(required)}`,
        }),
      );
      findings = [
        ...findings,
        ...audit.findings,
        ...validateMeasurementConfirmations(
          rejected,
          required,
          audit.confirmedMeasurements,
        ),
      ];
      if (!findings.length) return toRecipeContent(rejected, source);
      // Keep verified cooking content when repair cannot settle optional inferred
      // metadata. Omit disputed values, never substitute a new estimate.
      if (
        attempt === 1 &&
        findings.every(
          (finding) =>
            finding.area === "metadata" &&
            finding.metadataField &&
            (finding.code === "measurement" ||
              finding.code === "omission" ||
              finding.code === "formatting") &&
            rejected![finding.metadataField]?.origin !== "published",
        )
      ) {
        const cleaned = { ...rejected };
        for (const finding of findings) cleaned[finding.metadataField!] = null;
        cleaned.timingBasis = {
          totalMinutes: null,
          summary:
            "Disputed inferred metadata was omitted after independent verification.",
          unresolvedReason:
            "The extraction and verification could not establish a consistent estimate from the supplied source.",
        };
        if (!validateImportedRecipe(cleaned, source).length)
          return toRecipeContent(cleaned, source);
      }
    } catch (error) {
      if (error instanceof ImportFailure && error.code !== "unsafe_result")
        throw error;
      if (
        !(error instanceof ImportFailure) &&
        !(error instanceof Error && error.name === "ZodError")
      )
        throw error;
      findings = [
        {
          area: "contract",
          code: "formatting",
          sourceIds: [],
          detail:
            "Return a complete response matching the typed output contract.",
        },
      ];
    }
  }
  throw new ImportFailure(
    "unsafe_result",
    "Recipe normalization failed validation.",
    [...new Set(findings.map((finding) => finding.area))],
    [...new Set(findings.flatMap((finding) => finding.sourceIds))].slice(0, 24),
    [...new Set(findings.map((finding) => finding.code))],
  );
}
