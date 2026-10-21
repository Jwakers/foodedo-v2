import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getCurrentUser, requireUserId } from "./lib/auth";
import {
  membership,
  requireSpace,
  copyRecipeToSpace,
  leaveMembership,
} from "./lib/spaces";
import type { Id } from "./_generated/dataModel";
import { SHOPPING_LIST_LIMITS } from "../src/lib/domain/shopping-list";
import { syncShoppingListForPlan } from "./lib/shoppingListSync";

const memberView = v.object({ userId: v.id("users"), name: v.string() });
export const current = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({ _id: v.id("households"), members: v.array(memberView) }),
  ),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const member = await membership(ctx, userId);
    if (!member) return null;
    const household = await ctx.db.get(member.householdId);
    if (!household || household.closedAt !== undefined) return null;
    const members = await ctx.db
      .query("householdMembers")
      .withIndex("by_household", (q) => q.eq("householdId", household._id))
      .collect();
    return {
      _id: household._id,
      members: await Promise.all(
        members.map(async (m) => ({
          userId: m.userId,
          name: (await ctx.db.get(m.userId))?.name ?? "Household member",
        })),
      ),
    };
  },
});
export const create = mutation({
  args: {},
  returns: v.id("households"),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const existing = await membership(ctx, userId);
    if (existing) return existing.householdId;
    const now = Date.now();
    const householdId = await ctx.db.insert("households", {
      creatorId: userId,
      createdAt: now,
    });
    await ctx.db.insert("householdMembers", {
      householdId,
      userId,
      joinedAt: now,
    });
    const plans = await ctx.db
      .query("mealPlans")
      .withIndex("by_owner_and_status_and_updated_at", (q) =>
        q.eq("ownerId", userId).eq("status", "active"),
      )
      .take(2);
    if (plans.length > 1)
      throw new ConvexError("Resolve your active weeks before sharing.");
    const plan = plans[0];
    if (!plan) return householdId;
    const { _id, _creationTime, ...planContent } = plan;
    void _creationTime;
    const newPlanId = await ctx.db.insert("mealPlans", {
      ...planContent,
      ownerId: householdId,
      createdAt: now,
      updatedAt: now,
    });
    const recipeIds = new Map<Id<"recipes">, Id<"recipes">>();
    const slots = await ctx.db
      .query("mealSlots")
      .withIndex("by_plan_and_date", (q) => q.eq("mealPlanId", _id))
      .take(32);
    if (slots.length > 31)
      throw new Error("This plan exceeds the supported limit.");
    for (const slot of slots) {
      const recipe = await ctx.db.get(slot.recipeId);
      if (!recipe || recipe.ownerId !== userId)
        throw new Error("A planned recipe is unavailable.");
      let recipeId = recipeIds.get(recipe._id);
      if (!recipeId) {
        recipeId = await copyRecipeToSpace(ctx, recipe, householdId);
        recipeIds.set(recipe._id, recipeId);
      }
      const { _id: slotId, _creationTime: slotTime, ...content } = slot;
      void slotId;
      void slotTime;
      await ctx.db.insert("mealSlots", {
        ...content,
        mealPlanId: newPlanId,
        ownerId: householdId,
        recipeId,
      });
    }
    const list = await ctx.db
      .query("shoppingLists")
      .withIndex("by_meal_plan", (q) => q.eq("mealPlanId", _id))
      .unique();
    if (list) {
      const newListId = await ctx.db.insert("shoppingLists", {
        ownerId: householdId,
        mealPlanId: newPlanId,
        mealPlanUpdatedAt: now,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      const items = await ctx.db
        .query("shoppingListItems")
        .withIndex("by_list_and_order", (q) => q.eq("shoppingListId", list._id))
        .take(SHOPPING_LIST_LIMITS.items + 1);
      if (items.length > SHOPPING_LIST_LIMITS.items)
        throw new Error("This shopping list exceeds the supported limit.");
      for (const item of items) {
        const { _id: itemId, _creationTime: itemTime, ...content } = item;
        void itemId;
        void itemTime;
        await ctx.db.insert("shoppingListItems", {
          ...content,
          ownerId: householdId,
          shoppingListId: newListId,
          sourceRecipeIds: item.sourceRecipeIds.flatMap(
            (id) => recipeIds.get(id) ?? [],
          ),
          ...(item.sources
            ? {
                sources: item.sources.flatMap((source) => {
                  const recipeId = recipeIds.get(source.recipeId);
                  return recipeId ? [{ ...source, recipeId }] : [];
                }),
              }
            : {}),
        });
      }
    }
    // Reconcile against the copied slots, preserving intentional item state.
    // The private list may still contain legacy/stale recipe references.
    await syncShoppingListForPlan(ctx, householdId, newPlanId);
    return householdId;
  },
});
export const leave = mutation({
  args: { householdId: v.id("households") },
  returns: v.null(),
  handler: async (ctx, { householdId }) => {
    await requireSpace(ctx, householdId);
    await leaveMembership(ctx, await requireUserId(ctx));
    return null;
  },
});
const inviteView = v.object({
  token: v.string(),
  expiresAt: v.number(),
  cancelled: v.boolean(),
});
export const invite = mutation({
  args: {
    householdId: v.id("households"),
    token: v.string(),
    replaceCancelled: v.optional(v.boolean()),
  },
  returns: inviteView,
  handler: async (ctx, { householdId, token, replaceCancelled }) => {
    await requireSpace(ctx, householdId);
    const existing = await ctx.db
      .query("householdInvites")
      .withIndex("by_household", (q) => q.eq("householdId", householdId))
      .order("desc")
      .first();
    const now = Date.now();
    if (
      existing &&
      !existing.acceptedBy &&
      existing.expiresAt > now &&
      (!existing.cancelledAt || !replaceCancelled)
    )
      return {
        token: existing.token,
        expiresAt: existing.expiresAt,
        cancelled: existing.cancelledAt !== undefined,
      };
    if (!/^[a-f0-9]{64}$/.test(token))
      throw new Error("Invalid invitation token.");
    if (
      await ctx.db
        .query("householdInvites")
        .withIndex("by_token", (q) => q.eq("token", token))
        .first()
    )
      throw new Error("Create another invitation.");
    const expiresAt = now + 7 * 24 * 60 * 60 * 1000;
    await ctx.db.insert("householdInvites", {
      householdId,
      token,
      inviterId: await requireUserId(ctx),
      createdAt: now,
      expiresAt,
    });
    return { token, expiresAt, cancelled: false };
  },
});
export const cancelInvite = mutation({
  args: { householdId: v.id("households"), token: v.string() },
  returns: v.null(),
  handler: async (ctx, { householdId, token }) => {
    await requireSpace(ctx, householdId);
    const invite = await ctx.db
      .query("householdInvites")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    if (invite?.householdId === householdId && !invite.acceptedBy)
      await ctx.db.patch(invite._id, { cancelledAt: Date.now() });
    return null;
  },
});
export const previewInvite = query({
  args: { token: v.string(), now: v.number() },
  returns: v.object({
    status: v.union(
      v.literal("ready"),
      v.literal("invalid"),
      v.literal("cancelled"),
      v.literal("used"),
      v.literal("expired"),
    ),
    inviterName: v.union(v.string(), v.null()),
    householdId: v.union(v.id("households"), v.null()),
  }),
  handler: async (ctx, { token, now }) => {
    const invite = await ctx.db
      .query("householdInvites")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    const household = invite ? await ctx.db.get(invite.householdId) : null;
    const user = await getCurrentUser(ctx);
    const member = user ? await membership(ctx, user._id) : null;
    const alreadyMember =
      !!invite && member?.householdId === invite.householdId;
    const status: "ready" | "invalid" | "cancelled" | "used" | "expired" =
      !invite || !household || household.closedAt !== undefined
        ? "invalid"
        : alreadyMember
          ? "ready"
          : invite.cancelledAt !== undefined
            ? "cancelled"
            : invite.acceptedBy
              ? "used"
              : invite.expiresAt <= now
                ? "expired"
                : "ready";
    return {
      status,
      inviterName:
        status === "ready" && invite
          ? ((await ctx.db.get(invite.inviterId))?.name ?? "Someone")
          : null,
      householdId: status === "ready" && invite ? invite.householdId : null,
    };
  },
});
export const acceptInvite = mutation({
  args: { token: v.string() },
  returns: v.id("households"),
  handler: async (ctx, { token }) => {
    const userId = await requireUserId(ctx);
    const invite = await ctx.db
      .query("householdInvites")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    if (!invite)
      throw new ConvexError(
        "This invitation is unavailable. Ask for a new link.",
      );
    const household = await ctx.db.get(invite.householdId);
    if (!household || household.closedAt !== undefined)
      throw new ConvexError("This household is closed.");
    const member = await membership(ctx, userId);
    if (member?.householdId === invite.householdId) return invite.householdId;
    if (member)
      throw new ConvexError(
        "Leave your current household before joining another.",
      );
    if (
      invite.acceptedBy ||
      invite.cancelledAt !== undefined ||
      invite.expiresAt <= Date.now()
    )
      throw new ConvexError(
        "This invitation is unavailable. Ask for a new link.",
      );
    await ctx.db.insert("householdMembers", {
      householdId: invite.householdId,
      userId,
      joinedAt: Date.now(),
    });
    await ctx.db.patch(invite._id, { acceptedBy: userId });
    return invite.householdId;
  },
});
