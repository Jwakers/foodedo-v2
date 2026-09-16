import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { getCurrentUser } from "./lib/auth";

const syncedUserFields = {
  authSubject: v.string(),
  email: v.union(v.string(), v.null()),
  name: v.union(v.string(), v.null()),
  createdAt: v.number(),
  updatedAt: v.number(),
};

const userDocument = v.object({
  _id: v.id("users"),
  _creationTime: v.number(),
  ...syncedUserFields,
});

export const current = query({
  args: {},
  returns: v.union(userDocument, v.null()),
  handler: async (ctx) => {
    return await getCurrentUser(ctx);
  },
});

export const upsertFromClerk = internalMutation({
  args: syncedUserFields,
  returns: v.null(),
  handler: async (ctx, attributes) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_auth_subject", (q) =>
        q.eq("authSubject", attributes.authSubject),
      )
      .unique();

    if (existing === null) {
      await ctx.db.insert("users", attributes);
    } else {
      await ctx.db.patch(existing._id, attributes);
    }

    return null;
  },
});

export const deleteFromClerk = internalMutation({
  args: { authSubject: v.string() },
  returns: v.null(),
  handler: async (ctx, { authSubject }) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_auth_subject", (q) => q.eq("authSubject", authSubject))
      .unique();
    if (existing === null) return null;
    const ownerId = existing._id;

    const planningPreferences = await ctx.db
      .query("planningPreferences")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .collect();
    for (const preferences of planningPreferences) {
      await ctx.db.delete(preferences._id);
    }

    const mealSlots = await ctx.db
      .query("mealSlots")
      .withIndex("by_owner_and_date", (q) => q.eq("ownerId", ownerId))
      .collect();
    for (const mealSlot of mealSlots) await ctx.db.delete(mealSlot._id);

    const guestClaims = await ctx.db
      .query("guestClaims")
      .withIndex("by_owner_and_claim_key", (q) => q.eq("ownerId", ownerId))
      .collect();
    for (const guestClaim of guestClaims) await ctx.db.delete(guestClaim._id);

    const mealPlans = await ctx.db
      .query("mealPlans")
      .withIndex("by_owner_and_updated_at", (q) => q.eq("ownerId", ownerId))
      .collect();
    for (const mealPlan of mealPlans) await ctx.db.delete(mealPlan._id);

    const shoppingListItems = await ctx.db
      .query("shoppingListItems")
      .withIndex("by_owner_and_updated_at", (q) => q.eq("ownerId", ownerId))
      .collect();
    for (const item of shoppingListItems) await ctx.db.delete(item._id);

    const shoppingLists = await ctx.db
      .query("shoppingLists")
      .withIndex("by_owner_and_updated_at", (q) => q.eq("ownerId", ownerId))
      .collect();
    for (const list of shoppingLists) await ctx.db.delete(list._id);

    const recipes = await ctx.db
      .query("recipes")
      .withIndex("by_owner_and_updated_at", (q) => q.eq("ownerId", ownerId))
      .collect();
    for (const recipe of recipes) await ctx.db.delete(recipe._id);

    await ctx.db.delete(existing._id);

    return null;
  },
});
