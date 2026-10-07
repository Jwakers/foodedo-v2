import {
  prepareRecipeContent,
  type RecipeContent,
  type RecipeMetadataProvenance,
  type RecipeNormalizationWarning,
} from "../../../src/lib/domain/recipes";
import {
  formatImportAmount,
  isScalableImportAmount,
  checkSourceAmount,
} from "./measurements";
import type { ImportedRecipe, ImportFinding } from "./models";
import type { RecipeSourceCandidate } from "./source";
import { validateTiming } from "./timing";

function sourceText(
  ids: string[],
  source: RecipeSourceCandidate,
  limit: number,
) {
  const byId = new Map(source.blocks.map((block) => [block.id, block.text]));
  return [...new Set(ids.map((id) => byId.get(id) ?? "").filter(Boolean))]
    .join("\n")
    .slice(0, limit);
}
function optionalText(value: string | null) {
  return value?.trim() || undefined;
}
/** Audit the consumer-facing measurements, not the extraction model's internal amount union. */
export function recipeForVerification(output: ImportedRecipe) {
  const notes = new Map(output.notes.map((note) => [note.id, note.text]));
  const resolveNotes = (refs: string[]) =>
    refs.map((id) => ({ id, text: notes.get(id) ?? null }));
  return {
    title: output.title,
    description: output.description,
    servings: output.servings,
    prepMinutes: output.prepMinutes,
    cookMinutes: output.cookMinutes,
    timingBasis: output.timingBasis,
    ingredients: output.ingredients.map((ingredient, index) => ({
      line: index + 1,
      sourceIds: ingredient.sourceIds,
      name: ingredient.name,
      amount: formatImportAmount(ingredient.amount).amountText ?? "unspecified",
      preparation: ingredient.note,
      group: ingredient.group,
      referencedNotes: resolveNotes(ingredient.noteRefs),
    })),
    steps: output.steps.map((step, index) => ({
      step: index + 1,
      sourceIds: step.sourceIds,
      instruction: step.text,
      group: step.group,
      referencedNotes: resolveNotes(step.noteRefs),
    })),
    notes: output.notes,
  };
}
export function toRecipeContent(
  output: ImportedRecipe,
  source: RecipeSourceCandidate,
): {
  recipe: RecipeContent;
  metadataProvenance: RecipeMetadataProvenance;
  normalizationWarnings: RecipeNormalizationWarning[];
} {
  const recipe = prepareRecipeContent({
    title: output.title.trim(),
    ...(optionalText(output.description)
      ? { description: output.description!.trim() }
      : {}),
    proteinCategory: output.proteinCategory,
    ingredients: output.ingredients.map((ingredient, index) => ({
      id: `ingredient-${index + 1}`,
      name: ingredient.name.trim(),
      shoppingCategory: ingredient.shoppingCategory,
      ...formatImportAmount(ingredient.amount),
      sourceText: sourceText(ingredient.sourceIds, source, 500),
      ...(optionalText(ingredient.note)
        ? { note: ingredient.note!.trim() }
        : {}),
      ...(optionalText(ingredient.group)
        ? { group: ingredient.group!.trim() }
        : {}),
      ...(ingredient.noteRefs.length ? { noteRefs: ingredient.noteRefs } : {}),
    })),
    steps: output.steps.map((step, index) => ({
      id: `step-${index + 1}`,
      text: step.text.trim(),
      sourceText: sourceText(step.sourceIds, source, 2000),
      ...(optionalText(step.group) ? { group: step.group!.trim() } : {}),
      ...(step.noteRefs.length ? { noteRefs: step.noteRefs } : {}),
    })),
    ...(output.notes.length
      ? {
          notes: output.notes.map((note) => ({
            id: note.id,
            text: note.text.trim(),
            sourceText: sourceText(note.sourceIds, source, 2000),
            ...(optionalText(note.label) ? { label: note.label!.trim() } : {}),
          })),
        }
      : {}),
    ...(output.servings ? { servings: output.servings.value } : {}),
    ...(output.prepMinutes ? { prepMinutes: output.prepMinutes.value } : {}),
    ...(output.cookMinutes ? { cookMinutes: output.cookMinutes.value } : {}),
    servingScaling: output.ingredients.every((ingredient) =>
      isScalableImportAmount(ingredient.amount),
    )
      ? "safe"
      : "source_only",
  });
  return {
    recipe,
    metadataProvenance: {
      ...(output.servings ? { servings: output.servings.origin } : {}),
      ...(output.prepMinutes ? { prepMinutes: output.prepMinutes.origin } : {}),
      ...(output.cookMinutes ? { cookMinutes: output.cookMinutes.origin } : {}),
    },
    normalizationWarnings: [],
  };
}

function balancedParentheses(text: string) {
  let depth = 0;
  for (const character of text) {
    if (character === "(") depth++;
    if (character === ")") depth--;
    if (depth < 0) return false;
  }
  return depth === 0;
}
export function validateImportedRecipe(
  output: ImportedRecipe,
  source: RecipeSourceCandidate,
): ImportFinding[] {
  const findings: ImportFinding[] = validateTiming(output);
  const ids = new Set(source.blocks.map((block) => block.id));
  const notes = new Set(output.notes.map((note) => note.id));
  const checkRefs = (sourceIds: string[], area: ImportFinding["area"]) => {
    if (sourceIds.some((id) => !ids.has(id)))
      findings.push({
        area,
        code: "source_reference",
        detail: "Use only source block IDs present in the evidence package.",
        sourceIds: sourceIds.filter((id) => !ids.has(id)).slice(0, 24),
      });
  };
  checkRefs(output.titleSourceIds, "metadata");
  for (const metadata of [
    output.servings,
    output.prepMinutes,
    output.cookMinutes,
    output.timingBasis.totalMinutes,
  ])
    if (metadata) checkRefs(metadata.sourceIds, "metadata");
  for (const ingredient of output.ingredients) {
    checkRefs(ingredient.sourceIds, "ingredients");
    if (
      (ingredient.amount.kind === "exact" ||
        ingredient.amount.kind === "range") &&
      /\b(?:small|medium|large)\b/i.test(ingredient.amount.qualifier ?? "")
    )
      findings.push({
        area: "ingredients",
        code: "formatting",
        sourceIds: ingredient.sourceIds,
        detail:
          "Move ingredient size (large/medium/small) from amount.qualifier into name. Keep the numeric amount unchanged; qualifiers are for measurements such as heaped/level.",
      });
    if (
      checkSourceAmount(
        ingredient.amount,
        sourceText(ingredient.sourceIds, source, Infinity),
      ) === "conflicting"
    )
      findings.push({
        area: "ingredients",
        code: "measurement",
        detail: `Amount not supported by cited source: ${JSON.stringify(ingredient.amount).slice(0, 230)}. Remove invented equivalents or package sizes; retain the published amount.`,
        sourceIds: ingredient.sourceIds,
      });
    if (
      !balancedParentheses(ingredient.name) ||
      (ingredient.note && !balancedParentheses(ingredient.note)) ||
      /\bEACH\s*:/i.test(ingredient.name)
    )
      findings.push({
        area: "ingredients",
        code: "formatting",
        detail:
          "Separate quantities and preparation from ingredient identity; balance parentheses.",
        sourceIds: ingredient.sourceIds,
      });
    if (ingredient.noteRefs.some((ref) => !notes.has(ref)))
      findings.push({
        area: "notes",
        code: "note_reference",
        detail:
          "Every note reference must resolve to a returned recipe note ID.",
        sourceIds: ingredient.sourceIds,
      });
  }
  for (const step of output.steps) {
    checkRefs(step.sourceIds, "method");
    if (step.noteRefs.some((ref) => !notes.has(ref)))
      findings.push({
        area: "notes",
        code: "note_reference",
        detail:
          "Every note reference must resolve to a returned recipe note ID.",
        sourceIds: step.sourceIds,
      });
  }
  for (const note of output.notes) checkRefs(note.sourceIds, "notes");
  if (notes.size !== output.notes.length)
    findings.push({
      area: "notes",
      code: "note_reference",
      sourceIds: [],
      detail: "Recipe note IDs must be unique.",
    });
  try {
    toRecipeContent(output, source);
  } catch {
    findings.push({
      area: "contract",
      code: "formatting",
      sourceIds: [],
      detail: "The recipe must satisfy the durable recipe content bounds.",
    });
  }
  return findings.slice(0, 30);
}

/** Unknown source notation is not a rejection, but it needs an explicit independent audit. */
export function requiredMeasurementConfirmations(
  output: ImportedRecipe,
  source: RecipeSourceCandidate,
) {
  return output.ingredients.flatMap((ingredient, index) =>
    checkSourceAmount(
      ingredient.amount,
      sourceText(ingredient.sourceIds, source, Infinity),
    ) === "inconclusive"
      ? [index + 1]
      : [],
  );
}

export function validateMeasurementConfirmations(
  output: ImportedRecipe,
  required: number[],
  confirmed: number[],
): ImportFinding[] {
  return required
    .filter((line) => !confirmed.includes(line))
    .map((line) => ({
      area: "ingredients",
      code: "measurement",
      sourceIds: output.ingredients[line - 1].sourceIds,
      detail: `Ingredient line ${line} requires explicit independent confirmation of its amount against the cited source. Do not invent or silently accept uncertain quantities.`,
    }));
}
