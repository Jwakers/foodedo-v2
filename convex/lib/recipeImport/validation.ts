import {
  prepareRecipeDraft,
  type RecipeContent,
  type RecipeMetadataProvenance,
  type RecipeNormalizationWarning,
} from "../../../src/lib/domain/recipes";
import { formatImportAmount, isScalableImportAmount } from "./measurements";
import type { ImportedRecipe } from "./models";
import type { RecipeSourceCandidate } from "./source";
import type { ImportDraftIssue } from "../../../src/lib/domain/recipe-import-draft";

/** A missing method link must be repaired or explicitly judged nonessential. */
export function unresolvedMethodNoteIssues(
  output: ImportedRecipe,
  issues: ImportDraftIssue[],
): ImportDraftIssue[] {
  const notes = new Set(output.notes.map((note) => note.id));
  return output.steps.flatMap((step, index) => {
    const missing = step.noteRefs.filter((id) => !notes.has(id));
    const targetId = `step-${index + 1}`;
    const explicitlyOptional = issues.some(
      (issue) =>
        issue.area === "method" &&
        issue.code === "unresolved_reference" &&
        issue.targetId === targetId &&
        !issue.blocking,
    );
    return !missing.length || explicitlyOptional
      ? []
      : [
          {
            area: "method",
            code: "unresolved_reference",
            targetId,
            message: `Restore the missing guidance referenced by this instruction (${missing.join(", ").slice(0, 120)}). If the link is nonessential, remove it or explicitly mark this method reference nonblocking.`,
            blocking: true,
          },
        ];
  });
}

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
export function recipeForCorrection(output: ImportedRecipe) {
  const notes = new Map(output.notes.map((note) => [note.id, note.text]));
  const resolveNotes = (refs: string[]) =>
    refs.map((id) => ({ id, text: notes.get(id) ?? null }));
  return {
    ...output,
    ingredients: output.ingredients.map((ingredient, index) => ({
      ...ingredient,
      index,
      line: index + 1,
      displayAmount:
        formatImportAmount(ingredient.amount).amountText ?? "unspecified",
      referencedNotes: resolveNotes(ingredient.noteRefs),
    })),
    steps: output.steps.map((step, index) => ({
      ...step,
      index,
      step: index + 1,
      referencedNotes: resolveNotes(step.noteRefs),
    })),
    notes: output.notes.map((note, index) => ({ ...note, index })),
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
  const noteIds = new Set(output.notes.map((note) => note.id));
  const normalizationWarnings: RecipeNormalizationWarning[] = [];
  const resolvedReferences = (refs: string[], targetId: string) => {
    if (refs.some((id) => !noteIds.has(id)))
      normalizationWarnings.push({
        area: "notes",
        code: "unresolved_reference",
        targetId,
      });
    return [...new Set(refs.filter((id) => noteIds.has(id)))];
  };
  const recipe = prepareRecipeDraft({
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
      ...(ingredient.noteRefs.length
        ? {
            noteRefs: resolvedReferences(
              ingredient.noteRefs,
              `ingredient-${index + 1}`,
            ),
          }
        : {}),
    })),
    steps: output.steps.map((step, index) => ({
      id: `step-${index + 1}`,
      text: step.text.trim(),
      timerCues: step.timerCues,
      sourceText: sourceText(step.sourceIds, source, 2000),
      ...(optionalText(step.group) ? { group: step.group!.trim() } : {}),
      ...(step.noteRefs.length
        ? { noteRefs: resolvedReferences(step.noteRefs, `step-${index + 1}`) }
        : {}),
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
    ...(output.minimumServings &&
    output.servings &&
    output.minimumServings.value <= output.servings.value
      ? { minimumServings: output.minimumServings.value }
      : {}),
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
      ...(recipe.minimumServings !== undefined && output.minimumServings
        ? { minimumServings: output.minimumServings.origin }
        : {}),
      ...(output.prepMinutes ? { prepMinutes: output.prepMinutes.origin } : {}),
      ...(output.cookMinutes ? { cookMinutes: output.cookMinutes.origin } : {}),
    },
    normalizationWarnings,
  };
}
