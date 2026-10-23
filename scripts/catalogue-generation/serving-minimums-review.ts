import { z } from "zod";
import {
  prepareRecipeContent,
  type RecipeContent,
} from "../../src/lib/domain/recipes";
import { recipeFingerprint } from "../../src/lib/domain/catalogue-generation";

export const reviewSchema = z.object({
  reviewStatus: z.enum(["proposed", "approved"]),
  reviewedBy: z.string().min(1).optional(),
  rows: z
    .array(
      z.object({
        catalogueMealId: z.string(),
        version: z.number().int().positive(),
        fingerprint: z.string(),
        resultFingerprint: z.string(),
        minimumServings: z.number().int().positive().nullable(),
        reason: z.string().min(1),
      }),
    )
    .min(1)
    .refine(
      (rows) =>
        new Set(rows.map((row) => row.catalogueMealId)).size === rows.length,
      "Review rows must have distinct catalogue meal IDs.",
    ),
});

export const exportSchema = z.array(
  z.object({
    catalogueMealId: z.string(),
    version: z.number(),
    fingerprint: z.string(),
    content: z.unknown().transform((value, ctx): RecipeContent => {
      try {
        return prepareRecipeContent(value as RecipeContent);
      } catch {
        ctx.addIssue({
          code: "custom",
          message: "The catalogue export contains invalid recipe content.",
        });
        return z.NEVER;
      }
    }),
  }),
);

/** Validate the whole review before any batch publishes a revision. */
export async function prepareServingMinimumChanges(
  review: z.infer<typeof reviewSchema>,
  currentMeals: z.infer<typeof exportSchema>,
) {
  const currentById = new Map(
    currentMeals.map((meal) => [meal.catalogueMealId, meal]),
  );
  const changes: typeof review.rows = [];
  for (const row of review.rows) {
    const current = currentById.get(row.catalogueMealId);
    if (!current) throw new Error(`Missing meal: ${row.catalogueMealId}`);
    const content = prepareRecipeContent({
      ...current.content,
      minimumServings: row.minimumServings ?? undefined,
    });
    if ((await recipeFingerprint(content)) !== row.resultFingerprint) {
      throw new Error(
        `Expected result fingerprint does not match the reviewed change: ${row.catalogueMealId}`,
      );
    }
    const isOriginal =
      current.version === row.version &&
      current.fingerprint === row.fingerprint;
    const isApplied =
      current.content.minimumServings === (row.minimumServings ?? undefined) &&
      current.fingerprint === row.resultFingerprint;
    if (!isOriginal && !isApplied)
      throw new Error(
        `Stale review: ${row.catalogueMealId}. Export and review again.`,
      );
    if (content.minimumServings !== current.content.minimumServings)
      changes.push(row);
  }
  return changes;
}
