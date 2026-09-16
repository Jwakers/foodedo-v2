import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { requireUserId } from "./lib/auth";
import { patchPlanningPreferences } from "./lib/planningPreferences";

const usualPlanDaysValidator = v.union(
  v.literal(3),
  v.literal(4),
  v.literal(5),
  v.literal(6),
  v.literal(7),
);

const planningPreferencesValidator = v.object({
  usualPlanDays: usualPlanDaysValidator,
  usualServings: v.number(),
  prioritiseSavedRecipes: v.boolean(),
});

export const getCurrent = query({
  args: {},
  returns: v.union(planningPreferencesValidator, v.null()),
  handler: async (ctx) => {
    const ownerId = await requireUserId(ctx);
    const preferences = await ctx.db
      .query("planningPreferences")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .unique();

    if (preferences === null) return null;
    return {
      usualPlanDays: preferences.usualPlanDays,
      usualServings: preferences.usualServings,
      prioritiseSavedRecipes: preferences.prioritiseSavedRecipes,
    };
  },
});

export const updateUsual = mutation({
  args: {
    usualPlanDays: v.optional(usualPlanDaysValidator),
    usualServings: v.optional(v.number()),
    prioritiseSavedRecipes: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, patch) => {
    const ownerId = await requireUserId(ctx);
    await patchPlanningPreferences(ctx, ownerId, patch);
    return null;
  },
});
