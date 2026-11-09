import { ConvexError, v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  tierPolicies,
  type AccountTier,
  type AccountFeature,
} from "../../src/lib/domain/entitlements";

export const entitlementValidator = v.object({
  tier: v.union(v.literal("free"), v.literal("premium")),
  validUntil: v.union(v.number(), v.null()),
  features: v.object({ recipeImport: v.boolean() }),
  limits: v.object({
    savedImportedRecipes: v.number(),
    importAttemptsPerMonth: v.number(),
    simultaneousImports: v.number(),
  }),
});

/** Grants are server-owned; future billing must verify status before writing them. */
export async function accountEntitlements(
  ctx: QueryCtx | MutationCtx,
  ownerId: Id<"users">,
  now: number,
) {
  const grant = await ctx.db
    .query("accountEntitlements")
    .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
    .unique();
  const tier: AccountTier =
    grant?.tier === "premium" &&
    Number.isFinite(grant.validUntil) &&
    grant.validUntil > now
      ? "premium"
      : "free";
  return {
    tier,
    validUntil: tier === "premium" ? grant!.validUntil : null,
    ...tierPolicies[tier],
  };
}

export async function requireFeature(
  ctx: MutationCtx,
  ownerId: Id<"users">,
  feature: AccountFeature,
) {
  const entitlement = await accountEntitlements(ctx, ownerId, Date.now());
  if (!entitlement.features[feature])
    throw new ConvexError({
      code: "FEATURE_UNAVAILABLE",
      message: "This feature is unavailable for your account.",
    });
  return entitlement;
}
