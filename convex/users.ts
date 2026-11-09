import type { Id } from "./_generated/dataModel";
import { importRateLimiter } from "./lib/importLimits";
import { ConvexError, v } from "convex/values";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import { leaveMembership } from "./lib/spaces";
import { onboardingValidator } from "./lib/onboarding";
import { getCurrentUser } from "./lib/auth";
import { internal } from "./_generated/api";

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
  onboarding: v.optional(onboardingValidator),
});

export const current = query({
  args: {},
  returns: v.union(userDocument, v.null()),
  handler: async (ctx) => {
    return await getCurrentUser(ctx);
  },
});

async function deletionForSubject(ctx: MutationCtx, authSubject: string) {
  return await ctx.db
    .query("deletedUserSubjects")
    .withIndex("by_auth_subject", (q) => q.eq("authSubject", authSubject))
    .unique();
}

/** Recover provisioning independently of Clerk webhook delivery. */
export const ensureCurrent = mutation({
  args: {},
  returns: v.id("users"),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new ConvexError({
        code: "UNAUTHENTICATED",
        message: "Sign in to prepare your Foodedo account.",
      });
    }
    if (await deletionForSubject(ctx, identity.subject)) {
      throw new ConvexError({
        code: "ACCOUNT_DELETED",
        message: "This Foodedo account has been deleted. Sign out to continue.",
      });
    }
    const existing = await getCurrentUser(ctx);
    if (existing !== null) return existing._id;

    const now = Date.now();
    return await ctx.db.insert("users", {
      authSubject: identity.subject,
      email: identity.email ?? null,
      name: identity.name ?? null,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const upsertFromClerk = internalMutation({
  args: syncedUserFields,
  returns: v.null(),
  handler: async (ctx, attributes) => {
    // A delayed create/update event must not resurrect a deleted identity.
    if (await deletionForSubject(ctx, attributes.authSubject)) return null;
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
    // Record deletion even if provisioning never ran or deletion is redelivered.
    if (!(await deletionForSubject(ctx, authSubject))) {
      await ctx.db.insert("deletedUserSubjects", { authSubject });
    }
    const existing = await ctx.db
      .query("users")
      .withIndex("by_auth_subject", (q) => q.eq("authSubject", authSubject))
      .unique();
    if (existing === null) return null;
    const ownerId = existing._id;
    await leaveMembership(ctx, ownerId);

    await ctx.db.delete(existing._id);
    await cleanUserData(ctx, ownerId);

    return null;
  },
});

const cleanupBatchSize = 8;

/** No public entry point: a cleanup cannot be aimed at a live account. */
export const cleanupDeletedUser = internalMutation({
  args: { ownerId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, { ownerId }) => {
    if (await ctx.db.get(ownerId))
      throw new Error("Cannot clean a live account.");
    await cleanUserData(ctx, ownerId);
    return null;
  },
});

async function cleanUserData(ctx: MutationCtx, ownerId: Id<"users">) {
  // Each index is equality-scoped; one shared budget bounds the entire batch.
  const queries = [
    () =>
      ctx.db
        .query("recipeImports")
        .withIndex("by_owner_and_updated_at", (q) => q.eq("ownerId", ownerId)),
    () =>
      ctx.db
        .query("mealSelectionFeedback")
        .withIndex("by_actor", (q) => q.eq("actorId", ownerId)),
    () =>
      ctx.db
        .query("allergyProfiles")
        .withIndex("by_owner", (q) => q.eq("ownerId", ownerId)),
    () =>
      ctx.db
        .query("planningPreferences")
        .withIndex("by_owner", (q) => q.eq("ownerId", ownerId)),
    () =>
      ctx.db
        .query("mealSlots")
        .withIndex("by_owner_and_date", (q) => q.eq("ownerId", ownerId)),
    () =>
      ctx.db
        .query("guestClaims")
        .withIndex("by_owner_and_claim_key", (q) => q.eq("ownerId", ownerId)),
    () =>
      ctx.db
        .query("shoppingListItems")
        .withIndex("by_owner_and_updated_at", (q) => q.eq("ownerId", ownerId)),
    () =>
      ctx.db
        .query("shoppingLists")
        .withIndex("by_owner_and_updated_at", (q) => q.eq("ownerId", ownerId)),
    () =>
      ctx.db
        .query("mealPlans")
        .withIndex("by_owner_and_updated_at", (q) => q.eq("ownerId", ownerId)),
    () =>
      ctx.db
        .query("recipes")
        .withIndex("by_owner_and_updated_at", (q) => q.eq("ownerId", ownerId)),
    () =>
      ctx.db
        .query("accountEntitlements")
        .withIndex("by_owner", (q) => q.eq("ownerId", ownerId)),
    () =>
      ctx.db
        .query("accountImportUsage")
        .withIndex("by_owner", (q) => q.eq("ownerId", ownerId)),
  ];
  let remaining = cleanupBatchSize;
  for (const query of queries) {
    const rows = await query().take(remaining);
    for (const row of rows) {
      if (
        "acquisitionRunId" in row &&
        row.acquisitionRunId &&
        "status" in row &&
        (row.status === "queued" || row.status === "processing")
      ) {
        await ctx.scheduler.runAfter(
          0,
          internal.recipeImportActions.cancelAcquisitionRun,
          { runId: row.acquisitionRunId },
        );
      }
      await ctx.db.delete(row._id);
    }
    remaining -= rows.length;
    if (remaining === 0) {
      await ctx.scheduler.runAfter(0, internal.users.cleanupDeletedUser, {
        ownerId,
      });
      return;
    }
  }
  await importRateLimiter.reset(ctx, "recipeImportAttempts", { key: ownerId });
}
