import type { RecipeContent, RecipeMetadataProvenance } from "./recipes";

export type ImportDraftIssue = {
  area: "ingredients" | "method" | "metadata" | "notes";
  code:
    | "ambiguous"
    | "unresolved_reference"
    | "source_conflict"
    | "partial_coverage";
  targetId: string | null;
  message: string;
  blocking: boolean;
};

/** Optional enrichment cannot veto a usable recipe, regardless of model advice. */
export function normalizeDraftIssues(
  issues: ImportDraftIssue[],
): ImportDraftIssue[] {
  return issues.map((issue) => ({
    ...issue,
    blocking:
      issue.blocking &&
      (issue.area === "ingredients" || issue.area === "method"),
  }));
}

export function requiredDraftIssues(recipe: RecipeContent): ImportDraftIssue[] {
  return [
    ...(!recipe.ingredients.length
      ? [
          {
            area: "ingredients" as const,
            message: "Add the recipe’s ingredients.",
          },
        ]
      : []),
    ...(!recipe.steps.length
      ? [
          {
            area: "method" as const,
            message: "Add the recipe’s cooking instructions.",
          },
        ]
      : []),
  ].map((issue) => ({
    ...issue,
    code: "partial_coverage",
    targetId: null,
    blocking: true,
  }));
}

/** Resume with readable normalized content, not a large JSON dump of provenance. */
export function draftRecipeText(
  recipe: RecipeContent,
  provenance?: RecipeMetadataProvenance,
) {
  const origin = (field: keyof RecipeMetadataProvenance) =>
    ` (previous draft: ${provenance?.[field] ?? "owner-provided"})`;
  return [
    recipe.title,
    recipe.description ?? "",
    recipe.servings === undefined
      ? ""
      : `Serves ${recipe.servings}${origin("servings")}`,
    recipe.minimumServings === undefined
      ? ""
      : `Minimum servings: ${recipe.minimumServings}${origin("minimumServings")}`,
    recipe.prepMinutes === undefined
      ? ""
      : `Preparation: ${recipe.prepMinutes} minutes${origin("prepMinutes")}`,
    recipe.cookMinutes === undefined
      ? ""
      : `Cooking: ${recipe.cookMinutes} minutes${origin("cookMinutes")}`,
    "Ingredients",
    ...recipe.ingredients.map((line) =>
      [
        line.group ? `[${line.group}]` : "",
        line.amountText ?? [line.quantity, line.unit].filter(Boolean).join(" "),
        line.name,
        line.note ? `(${line.note})` : "",
        line.noteRefs?.length ? `[see ${line.noteRefs.join(", ")}]` : "",
      ]
        .filter(Boolean)
        .join(" "),
    ),
    "Method",
    ...recipe.steps.map(
      (step, index) =>
        `${index + 1}. ${step.group ? `[${step.group}] ` : ""}${step.text}${step.noteRefs?.length ? ` [see ${step.noteRefs.join(", ")}]` : ""}`,
    ),
    "Recipe notes",
    ...(recipe.notes ?? []).map(
      (note) =>
        `${note.id}${note.label ? ` (${note.label})` : ""}: ${note.text}`,
    ),
  ]
    .filter(Boolean)
    .join("\n");
}

/** Unchanged draft values must not turn AI estimates into publisher facts on resume. */
export function preserveDraftMetadataProvenance(
  previous: RecipeContent,
  provenance: RecipeMetadataProvenance | undefined,
  next: RecipeContent,
  nextProvenance: RecipeMetadataProvenance,
): RecipeMetadataProvenance {
  const result = { ...nextProvenance };
  for (const field of [
    "servings",
    "minimumServings",
    "prepMinutes",
    "cookMinutes",
  ] as const) {
    if (previous[field] !== undefined && previous[field] === next[field]) {
      if (provenance?.[field]) result[field] = provenance[field];
      else delete result[field];
    }
  }
  return result;
}
