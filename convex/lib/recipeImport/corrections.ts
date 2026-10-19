"use node";

import { invalidModelOutput } from "./contracts";
import {
  importedRecipeSchema,
  type ImportedRecipe,
  type ImportCorrection,
} from "./models";

/** Apply edits against original positions, without shifting later edit targets. */
function editRows<T>(
  original: T[],
  edits: { start: number; remove: number; items: T[] }[],
): T[] {
  const sorted = [...edits].sort((a, b) => a.start - b.start);
  let previous: (typeof sorted)[number] | undefined;
  for (const edit of sorted) {
    if (
      !Number.isInteger(edit.start) ||
      !Number.isInteger(edit.remove) ||
      edit.start < 0 ||
      edit.remove < 0 ||
      edit.start > original.length ||
      edit.start + edit.remove > original.length ||
      (previous &&
        (edit.start === previous.start ||
          edit.start < previous.start + previous.remove))
    )
      throw invalidModelOutput(
        "Out-of-bounds or overlapping row corrections.",
        [{ path: "changes.rows", code: "overlapping_or_out_of_bounds" }],
      );
    previous = edit;
  }
  const result = [...original];
  for (const edit of sorted.reverse())
    result.splice(edit.start, edit.remove, ...edit.items);
  return result;
}

/** Never silently ignore duplicate fields or ambiguous row edits. */
export function applyRecipeCorrections(
  recipe: ImportedRecipe,
  correction: Pick<ImportCorrection, "changes" | "issues">,
): ImportedRecipe {
  const changed = new Set<string>();
  const merged = { ...recipe };
  for (const { field, value } of correction.changes) {
    if (changed.has(field))
      throw invalidModelOutput("Duplicate correction field.", [
        { path: `changes.${field}`, code: "duplicate_field" },
      ]);
    changed.add(field);
    if (field === "ingredients")
      merged.ingredients = editRows(recipe.ingredients, value);
    else if (field === "steps") merged.steps = editRows(recipe.steps, value);
    else if (field === "notes") merged.notes = editRows(recipe.notes, value);
    else Object.assign(merged, { [field]: value });
  }
  return importedRecipeSchema.parse(merged);
}
