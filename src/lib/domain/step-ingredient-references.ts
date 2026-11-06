/** Stored Cook enrichment. The UI highlights supplied references without matching prose. */
export type StepIngredientReference = {
  start: number;
  end: number;
  ingredientIds: string[];
  status: "resolved" | "ambiguous";
  usage:
    "whole" | "recipe_total" | "remaining" | "optional" | "instruction_amount";
  /** Independent of quantity usage: an explicit amount may also be optional. */
  optional?: boolean;
};

export type StepIngredientMapping = {
  version: 1;
  inputSignature: string;
  origin: "deterministic";
  status: "complete" | "partial";
  /** Fixed amounts in prose/notes, independent of the bounded display references. */
  hasFixedAmounts?: boolean;
  references: StepIngredientReference[];
};

export const MAXIMUM_STEP_REFERENCES = 32;
export const MAXIMUM_RECIPE_REFERENCES = 256;
export const MAXIMUM_CANDIDATE_LINES = 8;

const usages = new Set([
  "whole",
  "recipe_total",
  "remaining",
  "optional",
  "instruction_amount",
]);

/** Match and validate against the same Unicode token boundaries. Positions
 * always refer to original text, before case/normalization changes.
 */
export function ingredientTextTokens(text: string) {
  return Array.from(
    text.matchAll(/[\p{L}\p{N}][\p{L}\p{N}\p{M}]*/gu),
    (match) => ({
      text: match[0].normalize("NFKC").toLowerCase(),
      start: match.index,
      end: match.index + match[0].length,
    }),
  );
}

/** Shared structural guard for backend caches and presentation. This is not a
 * semantic confidence check; public recipe edits always regenerate enrichment.
 */
export function validStepIngredientReferences(
  mapping: StepIngredientMapping | undefined,
  text: string,
  ingredientIds: ReadonlySet<string>,
): mapping is StepIngredientMapping {
  if (!mapping) return false;
  const words = ingredientTextTokens(text);
  const starts = new Set(words.map((word) => word.start));
  const ends = new Set(words.map((word) => word.end));
  return (
    mapping?.version === 1 &&
    mapping.origin === "deterministic" &&
    (mapping.status === "complete" || mapping.status === "partial") &&
    (mapping.hasFixedAmounts === undefined ||
      typeof mapping.hasFixedAmounts === "boolean") &&
    (mapping.status !== "complete" ||
      mapping.references.every(
        (reference) => reference.status === "resolved",
      )) &&
    mapping.references.length <= MAXIMUM_STEP_REFERENCES &&
    mapping.references.every((reference, index, all) => {
      if (
        !Number.isInteger(reference.start) ||
        !Number.isInteger(reference.end) ||
        reference.start < (all[index - 1]?.end ?? 0) ||
        reference.end <= reference.start ||
        reference.end > text.length ||
        reference.ingredientIds.length === 0 ||
        reference.ingredientIds.length > MAXIMUM_CANDIDATE_LINES ||
        new Set(reference.ingredientIds).size !==
          reference.ingredientIds.length ||
        !reference.ingredientIds.every((id) => ingredientIds.has(id)) ||
        (reference.status !== "resolved" && reference.status !== "ambiguous") ||
        (reference.status === "resolved" &&
          reference.ingredientIds.length !== 1) ||
        !usages.has(reference.usage) ||
        (reference.optional !== undefined &&
          typeof reference.optional !== "boolean")
      )
        return false;
      // Preserve complete Unicode tokens; never slice inside a word or emoji.
      return starts.has(reference.start) && ends.has(reference.end);
    })
  );
}
