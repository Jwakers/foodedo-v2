import {
  MAXIMUM_PLAN_SERVINGS,
  MINIMUM_PLAN_SERVINGS,
  type PlanDays,
} from "../../src/lib/domain/guest-draft";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export type PlanningPreferencesPatch = {
  usualPlanDays?: PlanDays;
  usualServings?: number;
  prioritiseSavedRecipes?: boolean;
};

const defaultPlanningPreferences = {
  usualPlanDays: 7,
  usualServings: 4,
  prioritiseSavedRecipes: true,
} as const;

export async function patchPlanningPreferences(
  ctx: MutationCtx,
  ownerId: Id<"users">,
  patch: PlanningPreferencesPatch,
  updatedAt = Date.now(),
) {
  if (
    patch.usualServings !== undefined &&
    (!Number.isInteger(patch.usualServings) ||
      patch.usualServings < MINIMUM_PLAN_SERVINGS ||
      patch.usualServings > MAXIMUM_PLAN_SERVINGS)
  ) {
    throw new Error(
      `Usual servings must be between ${MINIMUM_PLAN_SERVINGS} and ${MAXIMUM_PLAN_SERVINGS}.`,
    );
  }
  if (Object.keys(patch).length === 0) return;

  const existing = await ctx.db
    .query("planningPreferences")
    .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
    .unique();

  if (existing === null) {
    await ctx.db.insert("planningPreferences", {
      ownerId,
      ...defaultPlanningPreferences,
      ...patch,
      createdAt: updatedAt,
      updatedAt,
    });
    return;
  }

  await ctx.db.patch(existing._id, { ...patch, updatedAt });
}
