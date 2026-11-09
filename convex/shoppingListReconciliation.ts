import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { syncShoppingListForPlan } from "./lib/shoppingListSync";

/** Always read latest recipe content; an old worker cannot reapply an old edit. */
export const reconcileRecipeHistory = internalMutation({
  args: { recipeId: v.id("recipes"), cursor: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, { recipeId, cursor }) => {
    const recipe = await ctx.db.get(recipeId);
    if (!recipe || !(await ctx.db.get(recipe.ownerId))) return null;
    const page = await ctx.db
      .query("mealSlots")
      .withIndex("by_recipe", (q) => q.eq("recipeId", recipeId))
      .paginate({ cursor, numItems: 1 });
    const slot = page.page[0];
    const plan = slot ? await ctx.db.get(slot.mealPlanId) : null;
    if (plan?.ownerId === recipe.ownerId && plan.status === "archived")
      await syncShoppingListForPlan(ctx, recipe.ownerId, plan._id);
    if (!page.isDone)
      await ctx.scheduler.runAfter(
        0,
        internal.shoppingListReconciliation.reconcileRecipeHistory,
        { recipeId, cursor: page.continueCursor },
      );
    return null;
  },
});
