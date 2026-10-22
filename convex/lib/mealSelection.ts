import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { requireUserId } from "./auth";
import type { SpaceId } from "./spaces";

export const MAXIMUM_SELECTION_FEEDBACK = 200;
const maximumSavedRecipesPerMember = 200;

export function recipeSelectionKey(recipe: Doc<"recipes">): string {
  return recipe.source.type === "catalogue"
    ? `catalogue:${recipe.source.catalogueMealId}`
    : `recipe:${recipe.selectionKey ?? recipe._id}`;
}

/** Call only after validating access to ownerId. Never returns other members' recipes. */
export async function getMealSelectionSignals(
  ctx: QueryCtx | MutationCtx,
  ownerId: SpaceId,
) {
  const actorId = await requireUserId(ctx);
  const householdId = ctx.db.normalizeId("households", ownerId);
  const members = householdId
    ? (
        await ctx.db
          .query("householdMembers")
          .withIndex("by_household", (q) => q.eq("householdId", householdId))
          .collect()
      )
        .map((member) => member.userId)
        .sort()
    : [actorId];
  const savedByMember = await Promise.all(
    members.map(async (userId) => {
      if (householdId) {
        // Read catalogue saves directly so private imports cannot crowd out
        // older favourites or expose their contents to the shared adapter.
        return await ctx.db
          .query("recipes")
          .withIndex("by_owner_and_catalogue_source", (q) =>
            q.eq("ownerId", userId).gt("source.catalogueMealId", ""),
          )
          .filter((q) => q.gt(q.field("savedAt"), 0))
          .collect();
      }
      return await ctx.db
        .query("recipes")
        .withIndex("by_owner_and_saved_at", (q) =>
          q.eq("ownerId", userId).gt("savedAt", 0),
        )
        .order("desc")
        .take(maximumSavedRecipesPerMember);
    }),
  );
  const signals = new Map<
    string,
    { isSaved: boolean; savedByMemberKeys: string[]; dismissalCount: number }
  >();
  const get = (key: string) => {
    let entry = signals.get(key);
    if (!entry) {
      entry = { isSaved: false, savedByMemberKeys: [], dismissalCount: 0 };
      signals.set(key, entry);
    }
    return entry;
  };
  savedByMember.forEach((recipes, index) => {
    const keys = new Set(
      recipes.flatMap((recipe) =>
        // Shared planning may use catalogue preferences, never reveal a private import.
        householdId && recipe.source.type !== "catalogue"
          ? []
          : [recipeSelectionKey(recipe)],
      ),
    );
    for (const key of keys) {
      const signal = get(key);
      signal.isSaved = true;
      if (householdId) signal.savedByMemberKeys.push(`member-${index}`);
    }
  });
  const feedback = await ctx.db
    .query("mealSelectionFeedback")
    .withIndex("by_owner_and_updated_at", (q) => q.eq("ownerId", ownerId))
    .order("desc")
    .take(MAXIMUM_SELECTION_FEEDBACK);
  for (const entry of feedback) {
    if (entry.outcome === "dismissed") get(entry.candidateKey).dismissalCount++;
  }
  return signals;
}

/** One outcome per meal on a plan day: retries and swap-back cannot multiply it. */
export async function recordMealSelectionOutcome(
  ctx: MutationCtx,
  args: {
    ownerId: SpaceId;
    mealPlanId: Id<"mealPlans">;
    date: string;
    candidateKey: string;
    outcome: "kept" | "dismissed";
    updatedAt: number;
  },
) {
  const actorId = await requireUserId(ctx);
  const existing = await ctx.db
    .query("mealSelectionFeedback")
    .withIndex("by_plan_date_candidate", (q) =>
      q
        .eq("mealPlanId", args.mealPlanId)
        .eq("date", args.date)
        .eq("candidateKey", args.candidateKey),
    )
    .unique();
  if (existing) {
    if (existing.outcome !== args.outcome)
      await ctx.db.patch(existing._id, { ...args, actorId });
  } else {
    await ctx.db.insert("mealSelectionFeedback", { ...args, actorId });
  }
}
