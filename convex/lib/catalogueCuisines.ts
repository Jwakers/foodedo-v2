import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  CUISINE_TAXONOMY_VERSION,
  normaliseCuisines,
} from "../../src/lib/domain/cuisines";

export async function currentCuisineReview(
  ctx: QueryCtx | MutationCtx,
  mealId: Id<"catalogueMeals">,
  fingerprint: string,
) {
  const review = await ctx.db
    .query("catalogueCuisineMetadata")
    .withIndex("by_meal", (q) => q.eq("mealId", mealId))
    .unique();
  if (review === null) return null;
  return review.fingerprint === fingerprint &&
    review.taxonomyVersion === CUISINE_TAXONOMY_VERSION
    ? review
    : null;
}

// Called only after the enclosing administrator review/publication checks.
export async function saveCuisineReview(
  ctx: MutationCtx,
  review: {
    mealId: Id<"catalogueMeals">;
    fingerprint: string;
    cuisines: string[];
    rationale: string;
    reviewedBy: string;
    reviewedAt: number;
  },
) {
  const previous = await ctx.db
    .query("catalogueCuisineMetadata")
    .withIndex("by_meal", (q) => q.eq("mealId", review.mealId))
    .unique();
  const values = {
    ...review,
    cuisines: normaliseCuisines(review.cuisines),
    taxonomyVersion: CUISINE_TAXONOMY_VERSION,
  };
  if (previous) await ctx.db.replace(previous._id, values);
  else await ctx.db.insert("catalogueCuisineMetadata", values);
}
