"use node";
import {
  catalogueStatistics,
  nearestRecipes,
  normaliseRecipeText,
  validateGeneratedRecipe,
  type AnalysisMeal,
  type QualityFinding,
  type EditorialTags,
} from "../../../src/lib/domain/catalogue-generation";
import type { RecipeContent } from "../../../src/lib/domain/recipes";
import {
  authoredSchema,
  revisionSchema,
  revisionRepairSchema,
  revisedRecipeContent,
  conceptSchema,
  reviewSchema,
  repairSchema,
  recipeContent,
  type GenerationClient,
} from "./models";
import {
  AUTHOR_PROMPT,
  REVISION_PROMPT,
  SELECTION_PROMPT,
  REVIEW_PROMPT,
  REPAIR_PROMPT,
  PHOTOGRAPHY_STYLE,
  PHOTOGRAPHY_STYLE_V2,
  LEGACY_PHOTOGRAPHY_STYLE,
} from "./prompts";

export async function generateProposal(
  client: GenerationClient,
  meals: AnalysisMeal[],
  replacement?: {
    concept: string;
    rationale: string;
    content: RecipeContent;
    feedback?: string;
  },
  editorialBrief?: string,
) {
  const initialPrompt = editorialBrief?.trim();
  if ((initialPrompt?.length ?? 0) > 2000)
    throw new Error("Recipe requests must be at most 2,000 characters.");
  const concept = replacement
    ? { concept: replacement.concept, rationale: replacement.rationale }
    : initialPrompt
      ? {
          concept: initialPrompt,
          rationale: `Requested by the administrator: ${initialPrompt}`,
        }
      : await client.text("selection", conceptSchema, SELECTION_PROMPT, {
          statistics: catalogueStatistics(meals),
          catalogue: meals.map((m) => ({
            title: m.content.title,
            protein: m.content.proteinCategory,
            prepMinutes: m.content.prepMinutes,
            cookMinutes: m.content.cookMinutes,
            cost: m.content.costBand,
            tags: m.tags,
            pendingRevision: Boolean(m.isCatalogueRevision),
          })),
        });
  // An explicit request goes directly to authoring. Catalogue comparison stays
  // in validation/review so it cannot override the requested dish.
  const terms = new Set(
    normaliseRecipeText(concept.concept)
      .split(" ")
      .filter((word) => word.length > 2),
  );
  const nearby = initialPrompt
    ? undefined
    : [...meals]
        .map((meal) => ({
          meal,
          score: normaliseRecipeText(
            `${meal.content.title} ${meal.content.ingredients.map((i) => i.name).join(" ")}`,
          )
            .split(" ")
            .filter((word) => terms.has(word)).length,
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .map(({ meal }) => ({
          title: meal.content.title,
          ingredients: meal.content.ingredients.map((i) => i.name),
          tags: meal.tags,
        }));
  const authored = await client.text(
    "authoring",
    authoredSchema,
    AUTHOR_PROMPT,
    {
      ...concept,
      previousRecipe: replacement?.content,
      feedback: replacement?.feedback,
      administratorRequest: initialPrompt,
      ...(initialPrompt
        ? {}
        : {
            existingTitles: meals.map((meal) => meal.content.title),
            nearestExistingMeals: nearby,
          }),
    },
  );
  let content = recipeContent(authored.recipe);
  let tags = authored.tags;
  const validation = validateGeneratedRecipe(content, meals);
  const review = await client.text(
    "culinary_review",
    reviewSchema,
    REVIEW_PROMPT,
    {
      recipe: content,
      tags,
      deterministicFindings: validation.findings,
      ...culinaryComparisons(content, meals),
    },
  );
  let findings: QualityFinding[] = [...validation.findings, ...review.findings];
  if (findings.some((f) => f.blocking)) {
    const repaired = await client.text(
      "targeted_repair",
      repairSchema,
      REPAIR_PROMPT,
      {
        recipe: content,
        tags,
        concept,
        findings,
        nearest: nearestRecipes(content, meals),
      },
    );
    content = recipeContent(repaired.recipe);
    tags = repaired.tags;
    findings = [
      ...validateGeneratedRecipe(content, meals).findings,
      ...repaired.findings,
    ];
  }
  if (findings.some((f) => f.blocking))
    throw new Error(
      `Recipe did not pass culinary review: ${findings
        .filter((f) => f.blocking)
        .map((f) => f.message)
        .join(" ")
        .slice(0, 800)}`,
    );
  return { ...concept, content, tags, findings };
}
export function photographyPrompt(
  content: RecipeContent,
  imageStyleVersion?: string,
) {
  const style =
    imageStyleVersion === "natural-food-v1"
      ? LEGACY_PHOTOGRAPHY_STYLE
      : imageStyleVersion === "natural-food-v2"
        ? PHOTOGRAPHY_STYLE_V2
        : PHOTOGRAPHY_STYLE;
  return `${style}\nAPPROVED RECIPE (data):\n${JSON.stringify(content)}`;
}

/** Keep full cooking instructions for the closest comparisons, not the whole catalogue. */
export function culinaryComparisons(
  content: RecipeContent,
  meals: AnalysisMeal[],
) {
  const nearest = nearestRecipes(content, meals);
  return {
    nearest,
    comparableRecipes: nearest
      .slice(0, 3)
      .map((match) => meals.find((meal) => meal.key === match.key)?.content),
  };
}

export type ImprovementProgress =
  | { stage: "original_review"; findings: QualityFinding[] }
  | {
      stage: "authored";
      content: RecipeContent;
      tags: EditorialTags;
      changeSummary: string[];
      findings: QualityFinding[];
      originalFindings: QualityFinding[];
    };

/** Review first; only rewrite when there is a concrete improvement or request. */
export async function improveProposal(
  client: GenerationClient,
  original: RecipeContent,
  originalTags: EditorialTags,
  meals: AnalysisMeal[],
  feedback?: string,
  onProgress?: (progress: ImprovementProgress) => Promise<void>,
) {
  const administratorRequest = feedback?.trim();
  if ((administratorRequest?.length ?? 0) > 2000)
    throw new Error("Recipe requests must be at most 2,000 characters.");
  const originalValidation = validateGeneratedRecipe(original, meals);
  const originalReview = await client.text(
    "culinary_review",
    reviewSchema,
    REVIEW_PROMPT,
    {
      recipe: original,
      tags: originalTags,
      administratorRequest,
      deterministicFindings: originalValidation.findings,
      ...culinaryComparisons(original, meals),
    },
  );
  const originalFindings = [
    ...originalValidation.findings,
    ...originalReview.findings,
  ];
  await onProgress?.({ stage: "original_review", findings: originalFindings });
  if (!administratorRequest && !originalFindings.length)
    return {
      content: originalValidation.content,
      tags: originalTags,
      concept: original.title,
      rationale:
        "The critical review found no concrete issues; the published recipe was retained without unnecessary rewriting.",
      findings: [],
      changeSummary: [],
    };
  let revised = await client.text(
    "authoring",
    revisionSchema,
    REVISION_PROMPT,
    {
      originalRecipe: original,
      tags: originalTags,
      administratorRequest,
      findings: originalFindings,
    },
  );
  let content = revisedRecipeContent(revised.recipe);
  let tags = revised.tags;
  let validation = validateGeneratedRecipe(content, meals);
  await onProgress?.({
    stage: "authored",
    content,
    tags,
    changeSummary: revised.changeSummary,
    findings: validation.findings,
    originalFindings,
  });
  const review = await client.text(
    "culinary_review",
    reviewSchema,
    REVIEW_PROMPT,
    {
      recipe: content,
      tags,
      originalRecipe: original,
      administratorRequest,
      claimedChanges: revised.changeSummary,
      deterministicFindings: validation.findings,
      ...culinaryComparisons(content, meals),
    },
  );
  let findings = [...validation.findings, ...review.findings];
  await onProgress?.({
    stage: "authored",
    content,
    tags,
    changeSummary: revised.changeSummary,
    findings,
    originalFindings,
  });
  if (findings.some((finding) => finding.blocking)) {
    const repaired = await client.text(
      "targeted_repair",
      revisionRepairSchema,
      `${REVISION_PROMPT}\n${REPAIR_PROMPT}`,
      {
        originalRecipe: original,
        recipe: content,
        tags,
        administratorRequest,
        findings,
      },
    );
    revised = repaired;
    content = revisedRecipeContent(repaired.recipe);
    tags = repaired.tags;
    validation = validateGeneratedRecipe(content, meals);
    findings = [...validation.findings, ...repaired.findings];
    await onProgress?.({
      stage: "authored",
      content,
      tags,
      changeSummary: revised.changeSummary,
      findings,
      originalFindings,
    });
  }
  if (findings.some((finding) => finding.blocking))
    throw new Error(
      `Recipe improvement still has blocking findings: ${findings
        .filter((finding) => finding.blocking)
        .map((finding) => finding.message)
        .join(" ")
        .slice(0, 800)}`,
    );
  return {
    content,
    tags,
    concept: original.title,
    rationale:
      `Critical review: ${originalFindings.map((finding) => finding.message).join(" ") || "Administrator-requested change."}`.slice(
        0,
        4000,
      ),
    findings,
    changeSummary: revised.changeSummary,
  };
}
