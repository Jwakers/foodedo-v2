import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  introductionIds,
  mergeRetiredIntroductions,
  retiredIntroductionIds,
  type IntroductionId,
} from "../../src/lib/domain/onboarding";

export const introductionIdValidator = v.union(
  ...introductionIds.map((id) => v.literal(id)),
);
export const onboardingValidator = v.object({
  // Legacy fields are read for compatibility; new writes use stable IDs.
  homeRetired: v.optional(v.boolean()),
  recipesRetired: v.optional(v.boolean()),
  shoppingRetired: v.optional(v.boolean()),
  retired: v.optional(v.array(v.string())),
  firstSavedPlanId: v.optional(v.id("mealPlans")),
});
export const onboardingStateValidator = v.object({
  retired: v.array(v.string()),
  firstSavedPlanId: v.optional(v.id("mealPlans")),
});

export async function retireIntroductions(
  ctx: MutationCtx,
  userId: Id<"users">,
  introductions: readonly IntroductionId[],
) {
  const user = await ctx.db.get(userId);
  if (!user) return;
  const retired = mergeRetiredIntroductions(user.onboarding, introductions);
  if (retired.join(",") === (user.onboarding?.retired ?? []).join(",")) return;
  await ctx.db.patch(userId, { onboarding: { ...user.onboarding, retired } });
}

/** Infer eligibility for existing users without backfilling their documents. */
export async function readOnboardingState(ctx: QueryCtx, userId: Id<"users">) {
  const user = await ctx.db.get(userId);
  if (!user) return null;
  const retired = retiredIntroductionIds(user.onboarding);
  const [plan, claim, favourite] = await Promise.all([
    retired.includes("home")
      ? null
      : ctx.db
          .query("mealPlans")
          .withIndex("by_owner_and_updated_at", (q) => q.eq("ownerId", userId))
          .first(),
    retired.includes("home")
      ? null
      : ctx.db
          .query("guestClaims")
          .withIndex("by_owner_and_claim_key", (q) => q.eq("ownerId", userId))
          .first(),
    retired.includes("recipes")
      ? null
      : ctx.db
          .query("recipes")
          .withIndex("by_owner_and_saved_at", (q) =>
            q.eq("ownerId", userId).gt("savedAt", 0),
          )
          .filter((q) => q.eq(q.field("source.type"), "catalogue"))
          .first(),
  ]);
  return {
    retired: mergeRetiredIntroductions({ retired }, [
      ...(plan || claim ? ["home" as const] : []),
      ...(favourite ? ["recipes" as const] : []),
    ]),
    ...(user.onboarding?.firstSavedPlanId
      ? { firstSavedPlanId: user.onboarding.firstSavedPlanId }
      : {}),
  };
}

/** Called inside the successful plan-save transaction, after the plan exists. */
export async function recordSavedPlanIntroduction(
  ctx: MutationCtx,
  userId: Id<"users">,
  ownerId: Id<"users"> | Id<"households">,
  mealPlanId: Id<"mealPlans">,
) {
  const user = await ctx.db.get(userId);
  if (!user) return;
  const retired = retiredIntroductionIds(user.onboarding);
  let firstSavedPlanId = user.onboarding?.firstSavedPlanId;
  if (!firstSavedPlanId && !retired.includes("shopping")) {
    const [claim, privatePlans, spacePlans] = await Promise.all([
      ctx.db
        .query("guestClaims")
        .withIndex("by_owner_and_claim_key", (q) => q.eq("ownerId", userId))
        .first(),
      ctx.db
        .query("mealPlans")
        .withIndex("by_owner_and_updated_at", (q) => q.eq("ownerId", userId))
        .take(2),
      ownerId === userId
        ? []
        : ctx.db
            .query("mealPlans")
            .withIndex("by_owner_and_updated_at", (q) =>
              q.eq("ownerId", ownerId),
            )
            .take(2),
    ]);
    const hadPlan =
      claim ||
      [...privatePlans, ...spacePlans].some((plan) => plan._id !== mealPlanId);
    if (hadPlan) retired.push("shopping");
    else firstSavedPlanId = mealPlanId;
  }
  await ctx.db.patch(userId, {
    onboarding: {
      ...user.onboarding,
      retired: mergeRetiredIntroductions({ retired }, ["home"]),
      ...(firstSavedPlanId ? { firstSavedPlanId } : {}),
    },
  });
}
