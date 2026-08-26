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
    const recipes = await ctx.db
      .query("recipes")
      .withIndex("by_owner_and_updated_at", (q) =>
        q.eq("ownerSubject", authSubject),
      )
      .collect();

    for (const recipe of recipes) {
      await ctx.db.delete(recipe._id);
    }

    const existing = await ctx.db
      .query("users")
      .withIndex("by_auth_subject", (q) => q.eq("authSubject", authSubject))
      .unique();

    if (existing !== null) {
      await ctx.db.delete(existing._id);
    }

    return null;
  },
});
