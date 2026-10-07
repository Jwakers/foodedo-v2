import type { ImportedRecipe, ImportFinding } from "./models";

/** Shared by extraction and independent verification; no deterministic method parser. */
export const TIMING_POLICY = `Resolve recipe timing as a required part of normalization, not an optional enrichment:
Origin describes the numerical evidence, not the task: an explicitly timed preparation action is DERIVED just like an explicitly timed cooking action. "Spend 5 minutes peeling and chopping; simmer 20 minutes" supports prep 5 derived and cook 20 derived, unless additional untimed tasks contribute an estimate. Do not label an explicit preparation duration estimated merely because it appears in the method.
1. Use explicitly published PREP and COOK fields first, including explicit zero. A total/time-with-prep value is NOT a prep or cook field; retain it in timingBasis.totalMinutes with its evidence and honest origin.
2. If a component is missing, inspect the complete primary method. Account for sequential phases, overlapping/meanwhile tasks, and passive waits. Count elapsed cooking time, not the sum of simultaneous timers. Use the upper bound of explicit duration ranges for predictable integer metadata, preserving the range in the method. Derived arithmetic is allowed; no recipe actions, ingredient quantities or method durations may be invented.
3. Derive cooking from the timed critical path. Estimate short untimed cooking/preparation tasks cautiously from the actual actions/ingredients, using estimated origin. For a complete ordinary recipe, absence of labelled prep/cook headings is NOT a reason to leave times null. Cooking that is clearly absent can be 0 derived; absence of a cook label alone does not prove zero.
4. Reconcile an inferred split with a trustworthy published total: prep + cook must equal that total. Subtract known/derived cooking from total for the remaining prep allowance; label that allowance estimated when it also includes untimed handling/preheating. Do not double-count concurrent prep. If BOTH components are explicitly published, preserve them even if the publisher's total is inconsistent, and explain the discrepancy in a recipe note rather than changing published facts.
5. Return timingBasis.summary as a short factual basis (durations, overlap and any estimate), not hidden reasoning. Null is reserved for genuinely indeterminate timing, such as an open-ended fermentation or conflicting evidence that cannot support a useful estimate. If either component is null, timingBasis.unresolvedReason MUST explain the actual uncertainty; "not explicitly labelled" is not sufficient. Preserve unknown marinating/resting qualifiers in notes, never manufacture an exact duration.
Example: total 45 minutes; roast 12 minutes, meanwhile boil noodles 5 minutes, then bake 15-18 minutes. Cook = 12 + 18 = 30 derived (boiling overlaps), prep = 45 - 30 = 15 estimated. Do NOT return cook 35, prep 45, or null fields. Example without totals: chop vegetables then simmer 20 minutes => estimate prep from chopping, derive/estimate cook from simmer plus any untimed cooking actions, citing those source blocks.
Published = explicitly labelled prep/cook metadata (or labelled total in totalMinutes). Derived = mapped method durations, even a single phase, arithmetic or an explicit no-cook method. Estimated = inferred untimed tasks or a total's residual allowance. A method saying "simmer 20 minutes" supports cook 20 derived, not published overall cook metadata. Never label inferred values published.`;

export function validateTiming(output: ImportedRecipe): ImportFinding[] {
  const { prepMinutes, cookMinutes, timingBasis } = output;
  const sourceIds = [
    ...new Set([
      ...(timingBasis.totalMinutes?.sourceIds ?? []),
      ...(prepMinutes?.sourceIds ?? []),
      ...(cookMinutes?.sourceIds ?? []),
    ]),
  ].slice(0, 24);
  if ((!prepMinutes || !cookMinutes) && !timingBasis.unresolvedReason?.trim())
    return [
      {
        area: "metadata",
        code: "omission",
        sourceIds,
        detail:
          "Resolve prep/cook from published fields, method timing and overlap. If genuinely indeterminate, supply the actual uncertainty in timingBasis.unresolvedReason; missing headings are not a reason.",
      },
    ];
  if (
    prepMinutes &&
    cookMinutes &&
    timingBasis.totalMinutes?.origin === "published" &&
    (prepMinutes.origin !== "published" ||
      cookMinutes.origin !== "published") &&
    prepMinutes.value + cookMinutes.value !== timingBasis.totalMinutes.value
  )
    return [
      {
        area: "metadata",
        code: "measurement",
        sourceIds,
        detail: `The inferred prep/cook split must reconcile with the published total of ${timingBasis.totalMinutes.value} minutes. Count overlapping steps once; never put total time into prepMinutes.`,
      },
    ];
  return [];
}
