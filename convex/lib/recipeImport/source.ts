import type { RecipeContent } from "../../../src/lib/domain/recipes";
import { RECIPE_IMPORT_LIMITS } from "./contracts";

export type RecipeSourceCandidate = {
  sourceText: string;
  title?: string;
  description?: string;
  servings?: number;
  prepMinutes?: number;
  cookMinutes?: number;
  totalMinutes?: number;
  proteinCategory?: RecipeContent["proteinCategory"];
  ingredientLines: string[];
  ingredientGroups?: Array<string | undefined>;
  methodSteps: string[];
  method?: {
    label?: string;
    steps: Array<{ text: string; group?: string }>;
  };
  notes?: Array<{
    id: string;
    label?: string;
    text: string;
    sourceText?: string;
  }>;
  sourceUrl?: string;
  sourceName?: string;
  sourceAuthor?: string;
  sourceImageUrls?: string[];
  structuredCandidateCount?: number;
  findings?: Array<"source_conflict" | "partial_coverage">;
  extractor: "json_ld" | "text_sections" | "unstructured";
};

export type RecipeEvidenceBlock = {
  id: string;
  kind: "metadata" | "ingredient" | "instruction" | "note" | "page";
  text: string;
  group?: string;
  methodLabel?: string;
};

export function buildRecipeEvidence(
  candidate: RecipeSourceCandidate,
): RecipeEvidenceBlock[] {
  const blocks: RecipeEvidenceBlock[] = [];
  let metadataIndex = 0;
  const metadata = [
    candidate.title ? `Title: ${candidate.title}` : "",
    candidate.description ? `Description: ${candidate.description}` : "",
    candidate.servings === undefined ? "" : `Serves: ${candidate.servings}`,
    candidate.prepMinutes === undefined
      ? ""
      : `Preparation time: ${candidate.prepMinutes} minutes`,
    candidate.cookMinutes === undefined
      ? ""
      : `Cooking time: ${candidate.cookMinutes} minutes`,
    candidate.totalMinutes === undefined
      ? ""
      : `Total time: ${candidate.totalMinutes} minutes`,
  ].filter(Boolean);
  for (const text of metadata) {
    blocks.push({ id: `M${++metadataIndex}`, kind: "metadata", text });
  }
  candidate.ingredientLines.forEach((text, index) => {
    blocks.push({
      id: `I${index + 1}`,
      kind: "ingredient",
      text,
      ...(candidate.ingredientGroups?.[index]
        ? { group: candidate.ingredientGroups[index] }
        : {}),
    });
  });
  const method: NonNullable<RecipeSourceCandidate["method"]> = candidate.method
    ?.steps.length
    ? candidate.method
    : { steps: candidate.methodSteps.map((text) => ({ text })) };
  method.steps.forEach((step, stepIndex) => {
    blocks.push({
      id: `S${stepIndex + 1}`,
      kind: "instruction",
      text: step.text,
      ...(step.group ? { group: step.group } : {}),
      ...(method.label ? { methodLabel: method.label } : {}),
    });
  });
  candidate.notes?.forEach((note, index) => {
    blocks.push({
      id: `N${index + 1}`,
      kind: "note",
      text: note.sourceText ?? note.text,
    });
  });
  if (candidate.sourceText) {
    const coveredText = new Set(
      blocks.map((block) => comparableEvidenceText(block.text)),
    );
    let pageIndex = 0;
    let pageCharacters = 0;
    for (const line of candidate.sourceText.split(/\r?\n/)) {
      const text = cleanEvidenceText(line).slice(0, 1_000);
      if (!text || coveredText.has(comparableEvidenceText(text))) continue;
      if (pageCharacters + text.length > 16_000 || pageIndex >= 80) break;
      blocks.push({ id: `P${++pageIndex}`, kind: "page", text });
      pageCharacters += text.length;
    }
  }
  return blocks;
}

export function serializeRecipeEvidence(blocks: RecipeEvidenceBlock[]) {
  return blocks
    .map((block) => {
      const attributes = [
        block.kind,
        block.methodLabel ? `method=${block.methodLabel}` : "",
        block.group ? `group=${block.group}` : "",
      ].filter(Boolean);
      return `[${block.id}|${attributes.join("|")}]\n${block.text}`;
    })
    .join("\n\n")
    .slice(0, RECIPE_IMPORT_LIMITS.modelSourceCharacters);
}

function cleanEvidenceText(value: string) {
  return value
    .normalize("NFKC")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function comparableEvidenceText(value: string) {
  return cleanEvidenceText(value).toLowerCase().replace(/\s+/g, " ");
}
