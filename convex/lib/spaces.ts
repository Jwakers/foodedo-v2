import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { requireUserId } from "./auth";

export type SpaceId = Id<"users"> | Id<"households">;
export const spaceArgs = { householdId: v.optional(v.id("households")) };

export async function membership(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
) {
  return await ctx.db
    .query("householdMembers")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
}
export async function canReadSpace(
  ctx: QueryCtx | MutationCtx,
  ownerId: SpaceId,
) {
  const userId = await requireUserId(ctx);
  if (ownerId === userId) return true;
  const member = await membership(ctx, userId);
  if (member?.householdId !== ownerId) return false;
  const household = await ctx.db.get(member.householdId);
  return household !== null && household.closedAt === undefined;
}
export async function requireSpace(
  ctx: QueryCtx | MutationCtx,
  householdId?: Id<"households">,
): Promise<SpaceId> {
  const userId = await requireUserId(ctx);
  if (!householdId) return userId;
  if (!(await canReadSpace(ctx, householdId)))
    throw new ConvexError({
      code: "HOUSEHOLD_UNAVAILABLE",
      message:
        "You no longer have access to this household. Return to your private week.",
    });
  return householdId;
}
/** Household content never references another account's mutable private library. */
export async function copyRecipeToSpace(
  ctx: MutationCtx,
  recipe: Doc<"recipes">,
  ownerId: SpaceId,
) {
  if (recipe.ownerId === ownerId) return recipe._id;
  const { _id, _creationTime, savedAt, ...content } = recipe;
  void _id;
  void _creationTime;
  void savedAt;
  return await ctx.db.insert("recipes", { ...content, ownerId });
}
export async function leaveMembership(ctx: MutationCtx, userId: Id<"users">) {
  const member = await membership(ctx, userId);
  if (!member) return;
  await ctx.db.delete(member._id);
  const remaining = await ctx.db
    .query("householdMembers")
    .withIndex("by_household", (q) => q.eq("householdId", member.householdId))
    .first();
  if (!remaining)
    await ctx.db.patch(member.householdId, { closedAt: Date.now() });
}

export async function readSpace(
  ctx: QueryCtx,
  householdId?: Id<"households">,
): Promise<SpaceId | null> {
  if (!householdId) return await requireUserId(ctx);
  return (await canReadSpace(ctx, householdId)) ? householdId : null;
}
