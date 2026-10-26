import type { Id } from "../_generated/dataModel";
import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { SpaceId } from "./spaces";

export const maximumPlanSlots = 31;

export async function getActivePlanState(
  ctx: QueryCtx | MutationCtx,
  ownerId: SpaceId,
) {
  const activePlans = await ctx.db
    .query("mealPlans")
    .withIndex("by_owner_and_status_and_updated_at", (q) =>
      q.eq("ownerId", ownerId).eq("status", "active"),
    )
    .order("desc")
    .take(2);

  return {
    mealPlan: activePlans[0] ?? null,
    hasConflict: activePlans.length > 1,
  };
}

export async function getPlanSlots(
  ctx: QueryCtx | MutationCtx,
  mealPlanId: Id<"mealPlans">,
) {
  const mealSlots = await ctx.db
    .query("mealSlots")
    .withIndex("by_plan_and_date", (q) => q.eq("mealPlanId", mealPlanId))
    .take(maximumPlanSlots + 1);

  if (mealSlots.length > maximumPlanSlots) {
    throw new Error("A meal plan exceeds the supported number of meals.");
  }
  return mealSlots;
}
