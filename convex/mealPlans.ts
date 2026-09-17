import { ConvexError, v } from "convex/values";
import {
  addDaysToPlanDate,
  GUEST_DRAFT_SCHEMA_VERSION,
  isGuestClaimKey,
  isPlanDays,
  isPlanDate,
  MAXIMUM_PLAN_SERVINGS,
  MINIMUM_PLAN_SERVINGS,
  planDatesRemovedByShortening,
} from "../src/lib/domain/guest-draft";
import {
  findStandardCatalogueMeal,
  standardCatalogue,
} from "../src/lib/domain/standard-catalogue";
import { selectRankedPlanCandidates } from "../src/lib/domain/meal-plan-selection";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { requireUserId } from "./lib/auth";
import { getOrCreateCatalogueRecipe } from "./lib/catalogueRecipes";
import { patchPlanningPreferences } from "./lib/planningPreferences";
import {
  syncShoppingListForPlan,
  archiveShoppingListForPlan,
} from "./lib/shoppingListSync";

const maximumPlanSlots = 31;
const maximumActivePlanRecovery = 10;
const maximumPersonalPlanCandidates = 50;
const maximumRecentArchivedPlans = 11;
const defaultPlanServings = 4;
const minimumAdjustablePlanDays = 3;
const maximumAdjustablePlanDays = 7;
type PlanRecipeReference =
  | { type: "existing"; recipeId: Id<"recipes"> }
  | { type: "catalogue"; catalogueMealId: string };

type PlanRecipeChoice = {
  date: string;
  recipe: PlanRecipeReference;
  status: Doc<"mealSlots">["status"];
};

type PlanCandidate = {
  key: string;
  recipe: PlanRecipeReference;
  catalogueMealId: string | null;
  catalogueMealSlug: string | null;
  title: string;
  prepMinutes: number | null;
  cookMinutes: number | null;
};

const mealSlotViewValidator = v.object({
  _id: v.id("mealSlots"),
  date: v.string(),
  recipeId: v.id("recipes"),
  isAvailable: v.boolean(),
  catalogueMealId: v.union(v.string(), v.null()),
  catalogueMealSlug: v.union(v.string(), v.null()),
  title: v.string(),
  description: v.union(v.string(), v.null()),
  imageSrc: v.union(v.string(), v.null()),
  prepMinutes: v.union(v.number(), v.null()),
  cookMinutes: v.union(v.number(), v.null()),
  status: v.union(
    v.literal("planned"),
    v.literal("cooked"),
    v.literal("skipped"),
  ),
});

const mealPlanViewValidator = v.object({
  _id: v.id("mealPlans"),
  startDate: v.string(),
  endDate: v.string(),
  servings: v.number(),
  updatedAt: v.number(),
  status: v.union(v.literal("active"), v.literal("archived")),
  hasActivePlanConflict: v.boolean(),
  mealSlots: v.array(mealSlotViewValidator),
});

const archivedMealPlanSummaryValidator = v.object({
  _id: v.id("mealPlans"),
  startDate: v.string(),
  endDate: v.string(),
  status: v.literal("archived"),
});

const mealChoiceValidator = v.object({
  date: v.string(),
  // Null keeps a free day in the bounded plan window without creating a slot.
  catalogueMealId: v.union(v.string(), v.null()),
});

const claimResultValidator = v.union(
  v.object({
    status: v.literal("claimed"),
    mealPlanId: v.id("mealPlans"),
  }),
  v.object({
    status: v.literal("already_claimed"),
    mealPlanId: v.id("mealPlans"),
  }),
  v.object({ status: v.literal("catalogue_unsupported") }),
);

const swapResultValidator = v.union(
  v.object({ status: v.literal("swapped") }),
  v.object({ status: v.literal("not_found") }),
  v.object({ status: v.literal("plan_unavailable") }),
);

const proposalMealSlotValidator = v.object({
  date: v.string(),
  catalogueMealId: v.union(v.string(), v.null()),
  catalogueMealSlug: v.union(v.string(), v.null()),
  title: v.string(),
  prepMinutes: v.union(v.number(), v.null()),
  cookMinutes: v.union(v.number(), v.null()),
  isChanged: v.boolean(),
});

const regenerationProposalResultValidator = v.union(
  v.object({
    status: v.literal("ready"),
    sourcePlanId: v.id("mealPlans"),
    sourceUpdatedAt: v.number(),
    variant: v.number(),
    fromDate: v.string(),
    mealSlots: v.array(proposalMealSlotValidator),
  }),
  v.object({ status: v.literal("no_active_plan") }),
  v.object({ status: v.literal("plan_unavailable") }),
  v.object({ status: v.literal("no_future_meals") }),
);

const applyProposalResultValidator = v.union(
  v.object({
    status: v.literal("applied"),
    mealPlanId: v.id("mealPlans"),
    previousMealPlanId: v.id("mealPlans"),
    currentUpdatedAt: v.number(),
  }),
  v.object({ status: v.literal("plan_changed") }),
  v.object({ status: v.literal("no_active_plan") }),
  v.object({ status: v.literal("plan_unavailable") }),
  v.object({ status: v.literal("no_future_meals") }),
);

const undoReplacementResultValidator = v.union(
  v.object({ status: v.literal("restored") }),
  v.object({ status: v.literal("not_found") }),
  v.object({ status: v.literal("plan_changed") }),
);

const resolveActivePlanConflictResultValidator = v.union(
  v.object({ status: v.literal("resolved") }),
  v.object({ status: v.literal("not_found") }),
  v.object({ status: v.literal("too_many_active_plans") }),
);

const adjustActivePlanResultValidator = v.union(
  v.object({
    status: v.literal("adjusted"),
    addedDays: v.number(),
    removedDates: v.array(v.string()),
  }),
  v.object({ status: v.literal("plan_changed") }),
  v.object({ status: v.literal("no_active_plan") }),
  v.object({ status: v.literal("plan_unavailable") }),
);

export const getCurrent = query({
  args: {},
  returns: v.union(mealPlanViewValidator, v.null()),
  handler: async (ctx) => {
    const ownerId = await requireUserId(ctx);
    const activePlanState = await getActivePlanState(ctx, ownerId);
    const mealPlan = activePlanState.mealPlan;

    if (mealPlan === null) return null;

    return await buildMealPlanView(ctx, ownerId, mealPlan, {
      hasActivePlanConflict: activePlanState.hasConflict,
    });
  },
});

/** Cheap bounded metadata for the Week history selector. */
export const getRecentArchivedSummaries = query({
  args: {},
  returns: v.array(archivedMealPlanSummaryValidator),
  handler: async (ctx) => {
    const ownerId = await requireUserId(ctx);
    const mealPlans = await ctx.db
      .query("mealPlans")
      .withIndex("by_owner_and_status_and_updated_at", (q) =>
        q.eq("ownerId", ownerId).eq("status", "archived"),
      )
      .order("desc")
      .take(maximumRecentArchivedPlans);

    return mealPlans.map((mealPlan) => ({
      _id: mealPlan._id,
      startDate: mealPlan.startDate,
      endDate: mealPlan.endDate,
      status: "archived" as const,
    }));
  },
});

/** Hydrate one archived week only after the user selects it. */
export const getArchived = query({
  args: { mealPlanId: v.id("mealPlans") },
  returns: v.union(mealPlanViewValidator, v.null()),
  handler: async (ctx, { mealPlanId }) => {
    const ownerId = await requireUserId(ctx);
    const mealPlan = await ctx.db.get(mealPlanId);
    if (
      mealPlan === null ||
      mealPlan.ownerId !== ownerId ||
      mealPlan.status !== "archived"
    ) {
      return null;
    }

    return await buildMealPlanView(ctx, ownerId, mealPlan, {
      hasActivePlanConflict: false,
    });
  },
});

export const resolveActivePlanConflict = mutation({
  args: { keepMealPlanId: v.id("mealPlans") },
  returns: resolveActivePlanConflictResultValidator,
  handler: async (ctx, { keepMealPlanId }) => {
    const ownerId = await requireUserId(ctx);
    const activePlans = await ctx.db
      .query("mealPlans")
      .withIndex("by_owner_and_status_and_updated_at", (q) =>
        q.eq("ownerId", ownerId).eq("status", "active"),
      )
      .order("desc")
      .take(maximumActivePlanRecovery + 1);

    if (activePlans.length > maximumActivePlanRecovery) {
      return { status: "too_many_active_plans" } as const;
    }
    if (!activePlans.some((plan) => plan._id === keepMealPlanId)) {
      return { status: "not_found" } as const;
    }

    const updatedAt = Date.now();
    for (const plan of activePlans) {
      if (plan._id !== keepMealPlanId) {
        await ctx.db.patch(plan._id, { status: "archived", updatedAt });
        await archiveShoppingListForPlan(ctx, ownerId, plan._id, updatedAt);
      }
    }
    await ctx.db.patch(keepMealPlanId, { updatedAt });
    await syncShoppingListForPlan(ctx, ownerId, keepMealPlanId);

    return { status: "resolved" } as const;
  },
});

export const swapMeal = mutation({
  args: { mealSlotId: v.id("mealSlots") },
  returns: swapResultValidator,
  handler: async (ctx, { mealSlotId }) => {
    const ownerId = await requireUserId(ctx);
    const mealSlot = await ctx.db.get(mealSlotId);
    if (mealSlot === null || mealSlot.ownerId !== ownerId) {
      return { status: "not_found" } as const;
    }

    const mealPlan = await getSingleActivePlan(ctx, ownerId);
    if (mealPlan === null || mealPlan._id !== mealSlot.mealPlanId) {
      return { status: "not_found" } as const;
    }

    const mealSlots = await getPlanSlots(ctx, mealPlan._id);
    const recipesBySlot = await resolvePlanRecipes(ctx, mealSlots, ownerId);
    const currentRecipe = recipesBySlot.get(mealSlot._id);
    if (
      currentRecipe === undefined ||
      recipesBySlot.size !== mealSlots.length
    ) {
      return { status: "plan_unavailable" } as const;
    }

    const candidatePool = await getPlanningCandidates(ctx, ownerId);
    const currentCandidateKey = candidateKeyForRecipe(currentRecipe);
    const currentPreferredIndex =
      candidatePool.preferredKeys.indexOf(currentCandidateKey);
    const currentFallbackIndex =
      candidatePool.fallbackKeys.indexOf(currentCandidateKey);
    const [replacementKey] = selectRankedPlanCandidates({
      preferredCandidateIds: candidatePool.preferredKeys,
      fallbackCandidateIds: candidatePool.fallbackKeys,
      excludedCandidateIds: [...recipesBySlot.values()].map(
        candidateKeyForRecipe,
      ),
      numberOfMeals: 1,
      variant: Math.max(currentPreferredIndex, currentFallbackIndex, 0) + 2,
    });
    const replacement = candidatePool.byKey.get(replacementKey!);
    if (replacement === undefined) {
      return { status: "plan_unavailable" } as const;
    }
    const replacementRecipeId = await resolveRecipeReference(
      ctx,
      ownerId,
      replacement.recipe,
    );
    const updatedAt = Date.now();

    await ctx.db.patch(mealSlot._id, {
      recipeId: replacementRecipeId,
      status: "planned",
      updatedAt,
    });
    await ctx.db.patch(mealPlan._id, { updatedAt });
    await syncShoppingListForPlan(ctx, ownerId, mealPlan._id);

    return { status: "swapped" } as const;
  },
});

export const getRegenerationProposal = query({
  args: { fromDate: v.string(), variant: v.number() },
  returns: regenerationProposalResultValidator,
  handler: async (ctx, args) => {
    const ownerId = await requireUserId(ctx);
    validateProposalRequest(args);
    const mealPlan = await getSingleActivePlan(ctx, ownerId);
    if (mealPlan === null) {
      return { status: "no_active_plan" } as const;
    }

    const proposal = await buildRegenerationProposal(
      ctx,
      mealPlan,
      ownerId,
      args.fromDate,
      args.variant,
    );
    if (proposal.status !== "ready") return proposal;

    return {
      status: "ready" as const,
      sourcePlanId: mealPlan._id,
      sourceUpdatedAt: mealPlan.updatedAt,
      variant: args.variant,
      fromDate: args.fromDate,
      mealSlots: proposal.mealSlots,
    };
  },
});

export const applyRegenerationProposal = mutation({
  args: {
    sourcePlanId: v.id("mealPlans"),
    sourceUpdatedAt: v.number(),
    fromDate: v.string(),
    variant: v.number(),
  },
  returns: applyProposalResultValidator,
  handler: async (ctx, args) => {
    const ownerId = await requireUserId(ctx);
    validateProposalRequest(args);
    const mealPlan = await getSingleActivePlan(ctx, ownerId);
    if (mealPlan === null) {
      return { status: "no_active_plan" } as const;
    }
    if (
      mealPlan._id !== args.sourcePlanId ||
      mealPlan.updatedAt !== args.sourceUpdatedAt
    ) {
      return { status: "plan_changed" } as const;
    }

    const proposal = await buildRegenerationProposal(
      ctx,
      mealPlan,
      ownerId,
      args.fromDate,
      args.variant,
    );
    if (proposal.status !== "ready") return proposal;

    const updatedAt = Date.now();
    await ctx.db.patch(mealPlan._id, {
      status: "archived",
      updatedAt,
    });
    await archiveShoppingListForPlan(ctx, ownerId, mealPlan._id, updatedAt);
    const mealPlanId = await createPlanFromRecipeChoices(ctx, {
      ownerId,
      mealChoices: proposal.mealChoices,
      servings: mealPlan.servings ?? defaultPlanServings,
      createdAt: updatedAt,
    });

    return {
      status: "applied" as const,
      mealPlanId,
      previousMealPlanId: mealPlan._id,
      currentUpdatedAt: updatedAt,
    };
  },
});

export const undoPlanReplacement = mutation({
  args: {
    currentMealPlanId: v.id("mealPlans"),
    previousMealPlanId: v.id("mealPlans"),
    currentUpdatedAt: v.number(),
  },
  returns: undoReplacementResultValidator,
  handler: async (
    ctx,
    { currentMealPlanId, previousMealPlanId, currentUpdatedAt },
  ) => {
    const ownerId = await requireUserId(ctx);
    const activePlan = await getSingleActivePlan(ctx, ownerId);
    if (
      activePlan === null ||
      activePlan._id !== currentMealPlanId ||
      activePlan.updatedAt !== currentUpdatedAt
    ) {
      return { status: "plan_changed" } as const;
    }
    const previousPlan = await ctx.db.get(previousMealPlanId);
    if (
      previousPlan === null ||
      previousPlan.ownerId !== ownerId ||
      previousPlan.status !== "archived"
    ) {
      return { status: "not_found" } as const;
    }

    const updatedAt = Date.now();
    await ctx.db.patch(activePlan._id, { status: "archived", updatedAt });
    await archiveShoppingListForPlan(ctx, ownerId, activePlan._id, updatedAt);
    await ctx.db.patch(previousPlan._id, { status: "active", updatedAt });
    await syncShoppingListForPlan(ctx, ownerId, previousPlan._id);

    return { status: "restored" } as const;
  },
});

/**
 * Changes the shape of the active plan without replacing it. Existing slots
 * keep their recipe and status, are rebased by relative day, and are deleted
 * only when they fall outside a shortened range. Extension fills new trailing
 * days from the normal candidate pool.
 */
export const adjustActivePlan = mutation({
  args: {
    mealPlanId: v.id("mealPlans"),
    expectedUpdatedAt: v.number(),
    planDays: v.number(),
    startDate: v.string(),
    servings: v.number(),
    persistForFuture: v.boolean(),
  },
  returns: adjustActivePlanResultValidator,
  handler: async (ctx, args) => {
    const ownerId = await requireUserId(ctx);
    validateActivePlanAdjustment(args);
    const mealPlan = await getSingleActivePlan(ctx, ownerId);
    if (mealPlan === null) return { status: "no_active_plan" } as const;
    if (
      mealPlan._id !== args.mealPlanId ||
      mealPlan.updatedAt !== args.expectedUpdatedAt
    ) {
      return { status: "plan_changed" } as const;
    }

    const currentPlanDays =
      planDayOffset(mealPlan.startDate, mealPlan.endDate) + 1;
    if (currentPlanDays < 1 || currentPlanDays > maximumPlanSlots) {
      return { status: "plan_unavailable" } as const;
    }

    const mealSlots = await getPlanSlots(ctx, mealPlan._id);
    const slotsWithOffsets = mealSlots.map((slot) => ({
      slot,
      offset: planDayOffset(mealPlan.startDate, slot.date),
    }));
    if (
      slotsWithOffsets.some(
        ({ offset }) => offset < 0 || offset >= currentPlanDays,
      )
    ) {
      return { status: "plan_unavailable" } as const;
    }

    const addedDays = Math.max(args.planDays - currentPlanDays, 0);
    let additionalCandidates: PlanCandidate[] = [];
    if (addedDays > 0) {
      const candidates = await selectAdditionalPlanCandidates(
        ctx,
        ownerId,
        mealSlots,
        addedDays,
      );
      if (candidates === null) {
        return { status: "plan_unavailable" } as const;
      }
      additionalCandidates = candidates;
    }

    const retainedOffsets = new Set(
      slotsWithOffsets
        .filter(({ offset }) => offset < args.planDays)
        .map(({ offset }) => offset),
    );
    const availableRetainedOffsets = Array.from(
      { length: args.planDays },
      (_, offset) => offset,
    ).filter((offset) => !retainedOffsets.has(offset));
    const relocatedOffsets = new Map<Id<"mealSlots">, number>();
    for (const { slot, offset } of slotsWithOffsets) {
      if (offset < args.planDays) continue;
      const availableOffset = availableRetainedOffsets.shift();
      if (availableOffset === undefined) break;
      relocatedOffsets.set(slot._id, availableOffset);
    }

    const updatedAt = Math.max(Date.now(), mealPlan.updatedAt + 1);
    for (const { slot, offset } of slotsWithOffsets) {
      const nextOffset =
        offset < args.planDays ? offset : relocatedOffsets.get(slot._id);
      if (nextOffset === undefined) {
        await ctx.db.delete(slot._id);
        continue;
      }
      const nextDate = addDaysToPlanDate(args.startDate, nextOffset);
      if (nextDate !== slot.date) {
        await ctx.db.patch(slot._id, { date: nextDate, updatedAt });
      }
    }

    for (let index = 0; index < additionalCandidates.length; index += 1) {
      const candidate = additionalCandidates[index]!;
      const offset = currentPlanDays + index;
      const recipeId = await resolveRecipeReference(
        ctx,
        ownerId,
        candidate.recipe,
      );
      await ctx.db.insert("mealSlots", {
        mealPlanId: mealPlan._id,
        ownerId,
        date: addDaysToPlanDate(args.startDate, offset),
        recipeId,
        status: "planned",
        createdAt: updatedAt,
        updatedAt,
      });
    }

    const removedDates = planDatesRemovedByShortening({
      startDate: mealPlan.startDate,
      currentPlanDays,
      nextPlanDays: args.planDays,
    });
    await ctx.db.patch(mealPlan._id, {
      startDate: args.startDate,
      endDate: addDaysToPlanDate(args.startDate, args.planDays - 1),
      servings: args.servings,
      updatedAt,
    });

    if (args.persistForFuture) {
      await patchPlanningPreferences(
        ctx,
        ownerId,
        {
          ...(isPlanDays(args.planDays)
            ? { usualPlanDays: args.planDays }
            : {}),
          usualServings: args.servings,
        },
        updatedAt,
      );
    }

    await syncShoppingListForPlan(ctx, ownerId, mealPlan._id);

    return { status: "adjusted", addedDays, removedDates } as const;
  },
});

export const claimGuestDraft = mutation({
  args: {
    claimKey: v.string(),
    schemaVersion: v.literal(GUEST_DRAFT_SCHEMA_VERSION),
    catalogueVersion: v.number(),
    planStartDate: v.string(),
    servings: v.number(),
    mealChoices: v.array(mealChoiceValidator),
  },
  returns: claimResultValidator,
  handler: async (
    ctx,
    { claimKey, catalogueVersion, planStartDate, servings, mealChoices },
  ) => {
    const ownerId = await requireUserId(ctx);
    const validation = validateGuestPlan({
      claimKey,
      catalogueVersion,
      planStartDate,
      servings,
      mealChoices,
    });
    const existingClaim = await ctx.db
      .query("guestClaims")
      .withIndex("by_owner_and_claim_key", (q) =>
        q.eq("ownerId", ownerId).eq("claimKey", claimKey),
      )
      .unique();

    if (existingClaim !== null) {
      return {
        status: "already_claimed" as const,
        mealPlanId: existingClaim.mealPlanId,
      };
    }
    if (validation === "catalogue_unsupported") {
      return { status: "catalogue_unsupported" } as const;
    }

    const claimedAt = Date.now();
    const activePlan = await getSingleActivePlan(ctx, ownerId);
    if (activePlan !== null) {
      await ctx.db.patch(activePlan._id, {
        status: "archived",
        updatedAt: claimedAt,
      });
      await archiveShoppingListForPlan(ctx, ownerId, activePlan._id, claimedAt);
    }

    const mealPlanId = await createPlanFromGuestMealChoices(ctx, {
      ownerId,
      startDate: planStartDate,
      servings,
      mealChoices,
      createdAt: claimedAt,
    });

    await ctx.db.insert("guestClaims", {
      ownerId,
      claimKey,
      mealPlanId,
      claimedAt,
    });

    return { status: "claimed", mealPlanId } as const;
  },
});

async function buildMealPlanView(
  ctx: QueryCtx,
  ownerId: Id<"users">,
  mealPlan: Doc<"mealPlans">,
  { hasActivePlanConflict }: { hasActivePlanConflict: boolean },
) {
  const mealSlots = await getPlanSlots(ctx, mealPlan._id);
  const recipes = await Promise.all(
    mealSlots.map(async (mealSlot) => {
      return await ctx.db.get(mealSlot.recipeId);
    }),
  );
  const mealSlotViews = mealSlots.map((mealSlot, index) => {
    const recipe = recipes[index] ?? null;
    if (recipe === null || recipe.ownerId !== ownerId) {
      return {
        _id: mealSlot._id,
        date: mealSlot.date,
        recipeId: mealSlot.recipeId,
        isAvailable: false,
        catalogueMealId: null,
        catalogueMealSlug: null,
        title: "Recipe unavailable",
        description: null,
        imageSrc: null,
        prepMinutes: null,
        cookMinutes: null,
        status: mealSlot.status,
      };
    }

    const catalogueMeal =
      recipe.source.type === "catalogue"
        ? findStandardCatalogueMeal(
            recipe.source.catalogueMealId,
            recipe.source.catalogueVersion,
          )
        : null;

    return {
      _id: mealSlot._id,
      date: mealSlot.date,
      recipeId: recipe._id,
      isAvailable: true,
      catalogueMealId:
        recipe.source.type === "catalogue"
          ? recipe.source.catalogueMealId
          : null,
      catalogueMealSlug: catalogueMeal?.slug ?? null,
      title: recipe.title,
      description: recipe.description ?? catalogueMeal?.description ?? null,
      imageSrc: recipe.imageSrc ?? catalogueMeal?.imageSrc ?? null,
      prepMinutes: recipe.prepMinutes ?? null,
      cookMinutes: recipe.cookMinutes ?? null,
      status: mealSlot.status,
    };
  });

  return {
    _id: mealPlan._id,
    startDate: mealPlan.startDate,
    endDate: mealPlan.endDate,
    servings: mealPlan.servings ?? defaultPlanServings,
    updatedAt: mealPlan.updatedAt,
    status: mealPlan.status,
    hasActivePlanConflict,
    mealSlots: mealSlotViews,
  };
}

async function getSingleActivePlan(
  ctx: QueryCtx | MutationCtx,
  ownerId: Id<"users">,
): Promise<Doc<"mealPlans"> | null> {
  const state = await getActivePlanState(ctx, ownerId);
  if (state.hasConflict) {
    throw new Error("Resolve multiple active meal plans before continuing.");
  }
  return state.mealPlan;
}

async function getActivePlanState(
  ctx: QueryCtx | MutationCtx,
  ownerId: Id<"users">,
) {
  const activePlans = await ctx.db
    .query("mealPlans")
    .withIndex("by_owner_and_status_and_updated_at", (q) =>
      q.eq("ownerId", ownerId).eq("status", "active"),
    )
    .order("desc")
    .take(2);

  return {
    mealPlan: activePlans[0] ?? null,
    hasConflict: activePlans.length > 1,
  };
}

async function getPlanSlots(
  ctx: QueryCtx | MutationCtx,
  mealPlanId: Id<"mealPlans">,
) {
  const mealSlots = await ctx.db
    .query("mealSlots")
    .withIndex("by_plan_and_date", (q) => q.eq("mealPlanId", mealPlanId))
    .take(maximumPlanSlots + 1);

  if (mealSlots.length > maximumPlanSlots) {
    throw new Error("A meal plan exceeds the supported number of meals.");
  }
  return mealSlots;
}

async function buildRegenerationProposal(
  ctx: QueryCtx | MutationCtx,
  mealPlan: Doc<"mealPlans">,
  ownerId: Id<"users">,
  fromDate: string,
  variant: number,
): Promise<
  | { status: "plan_unavailable" }
  | { status: "no_future_meals" }
  | {
      status: "ready";
      mealSlots: Array<{
        date: string;
        catalogueMealId: string | null;
        catalogueMealSlug: string | null;
        title: string;
        prepMinutes: number | null;
        cookMinutes: number | null;
        isChanged: boolean;
      }>;
      mealChoices: PlanRecipeChoice[];
    }
> {
  const mealSlots = await getPlanSlots(ctx, mealPlan._id);
  const recipesBySlot = await resolvePlanRecipes(ctx, mealSlots, ownerId);
  if (mealSlots.length === 0 || recipesBySlot.size !== mealSlots.length) {
    return { status: "plan_unavailable" };
  }

  const replaceableSlots = mealSlots.filter((slot) => slot.date >= fromDate);
  if (replaceableSlots.length === 0) {
    return { status: "no_future_meals" };
  }

  const candidatePool = await getPlanningCandidates(ctx, ownerId);
  const currentCandidateKeys = mealSlots.map((slot) =>
    candidateKeyForRecipe(recipesBySlot.get(slot._id)!),
  );
  const selectedCandidateKeys = selectRankedPlanCandidates({
    preferredCandidateIds: candidatePool.preferredKeys,
    fallbackCandidateIds: candidatePool.fallbackKeys,
    excludedCandidateIds: currentCandidateKeys,
    numberOfMeals: replaceableSlots.length,
    variant,
  });
  const selectedCandidates = selectedCandidateKeys.map((key) =>
    candidatePool.byKey.get(key)!,
  );
  let replacementIndex = 0;

  const mealChoices = mealSlots.map((slot) => {
    const shouldReplace = slot.date >= fromDate;
    const recipe = recipesBySlot.get(slot._id)!;
    const selectedCandidate = shouldReplace
      ? selectedCandidates[replacementIndex++]!
      : planCandidateFromRecipe(recipe);

    return {
      date: slot.date,
      recipe: selectedCandidate.recipe,
      status: shouldReplace ? ("planned" as const) : slot.status,
    };
  });
  replacementIndex = 0;
  const proposalMealSlots: Array<{
    date: string;
    catalogueMealId: string | null;
    catalogueMealSlug: string | null;
    title: string;
    prepMinutes: number | null;
    cookMinutes: number | null;
    isChanged: boolean;
  }> = [];
  for (let index = 0; index < mealChoices.length; index += 1) {
    const mealSlot = mealSlots[index]!;
    const shouldReplace = mealSlot.date >= fromDate;
    const currentRecipe = recipesBySlot.get(mealSlot._id)!;
    const candidate = shouldReplace
      ? selectedCandidates[replacementIndex++]!
      : planCandidateFromRecipe(currentRecipe);

    proposalMealSlots.push({
      date: mealSlot.date,
      catalogueMealId: candidate.catalogueMealId,
      catalogueMealSlug: candidate.catalogueMealSlug,
      title: candidate.title,
      prepMinutes: candidate.prepMinutes,
      cookMinutes: candidate.cookMinutes,
      isChanged: candidate.key !== currentCandidateKeys[index],
    });
  }

  return {
    status: "ready",
    mealSlots: proposalMealSlots,
    mealChoices,
  };
}

async function resolvePlanRecipes(
  ctx: QueryCtx | MutationCtx,
  mealSlots: Array<Doc<"mealSlots">>,
  ownerId: Id<"users">,
) {
  const recipesBySlot = new Map<Id<"mealSlots">, Doc<"recipes">>();
  for (const mealSlot of mealSlots) {
    const recipe = await ctx.db.get(mealSlot.recipeId);
    if (recipe?.ownerId === ownerId) {
      recipesBySlot.set(mealSlot._id, recipe);
    }
  }
  return recipesBySlot;
}

async function getPlanningCandidates(
  ctx: QueryCtx | MutationCtx,
  ownerId: Id<"users">,
) {
  const savedRecipes = await ctx.db
    .query("recipes")
    .withIndex("by_owner_and_saved_at", (q) =>
      q.eq("ownerId", ownerId).gt("savedAt", 0),
    )
    .order("desc")
    .take(maximumPersonalPlanCandidates);
  const byKey = new Map<string, PlanCandidate>();
  const preferredKeys: string[] = [];

  for (const recipe of savedRecipes) {
    const candidate = planCandidateFromRecipe(recipe);
    if (!byKey.has(candidate.key)) {
      byKey.set(candidate.key, candidate);
      preferredKeys.push(candidate.key);
    }
  }

  const fallbackKeys: string[] = [];
  for (const catalogueMeal of standardCatalogue.meals) {
    const candidate = planCandidateFromCatalogue(catalogueMeal);
    if (!byKey.has(candidate.key)) {
      byKey.set(candidate.key, candidate);
      fallbackKeys.push(candidate.key);
    }
  }

  return { byKey, preferredKeys, fallbackKeys };
}

async function selectAdditionalPlanCandidates(
  ctx: QueryCtx | MutationCtx,
  ownerId: Id<"users">,
  mealSlots: Array<Doc<"mealSlots">>,
  numberOfMeals: number,
): Promise<PlanCandidate[] | null> {
  const recipesBySlot = await resolvePlanRecipes(ctx, mealSlots, ownerId);
  if (recipesBySlot.size !== mealSlots.length) return null;

  const candidatePool = await getPlanningCandidates(ctx, ownerId);
  const selectedKeys = selectRankedPlanCandidates({
    preferredCandidateIds: candidatePool.preferredKeys,
    fallbackCandidateIds: candidatePool.fallbackKeys,
    excludedCandidateIds: [...recipesBySlot.values()].map(
      candidateKeyForRecipe,
    ),
    numberOfMeals,
    variant: 1,
  });
  const candidates = selectedKeys.flatMap((key) => {
    const candidate = candidatePool.byKey.get(key);
    return candidate === undefined ? [] : [candidate];
  });

  return candidates.length === numberOfMeals ? candidates : null;
}

function planCandidateFromRecipe(recipe: Doc<"recipes">): PlanCandidate {
  const catalogueMeal =
    recipe.source.type === "catalogue"
      ? findStandardCatalogueMeal(
          recipe.source.catalogueMealId,
          recipe.source.catalogueVersion,
        )
      : null;

  return {
    key: candidateKeyForRecipe(recipe),
    recipe: { type: "existing", recipeId: recipe._id },
    catalogueMealId: catalogueMeal?.id ?? null,
    catalogueMealSlug: catalogueMeal?.slug ?? null,
    title: recipe.title,
    prepMinutes: recipe.prepMinutes ?? null,
    cookMinutes: recipe.cookMinutes ?? null,
  };
}

function planCandidateFromCatalogue(
  catalogueMeal: (typeof standardCatalogue.meals)[number],
): PlanCandidate {
  return {
    key: `catalogue:${catalogueMeal.id}`,
    recipe: { type: "catalogue", catalogueMealId: catalogueMeal.id },
    catalogueMealId: catalogueMeal.id,
    catalogueMealSlug: catalogueMeal.slug,
    title: catalogueMeal.title,
    prepMinutes: catalogueMeal.prepMinutes ?? null,
    cookMinutes: catalogueMeal.cookMinutes ?? null,
  };
}

function candidateKeyForRecipe(recipe: Doc<"recipes">) {
  if (
    recipe.source.type === "catalogue" &&
    findStandardCatalogueMeal(
      recipe.source.catalogueMealId,
      recipe.source.catalogueVersion,
    ) !== null
  ) {
    return `catalogue:${recipe.source.catalogueMealId}`;
  }
  return `recipe:${recipe._id}`;
}

async function resolveRecipeReference(
  ctx: MutationCtx,
  ownerId: Id<"users">,
  recipeReference: PlanRecipeReference,
) {
  if (recipeReference.type === "existing") {
    const recipe = await ctx.db.get(recipeReference.recipeId);
    if (recipe?.ownerId !== ownerId) {
      throw new Error("A selected personal recipe could not be resolved.");
    }
    return recipe._id;
  }

  const recipe = await getOrCreateCatalogueRecipe(ctx, {
    ownerId,
    catalogueMealId: recipeReference.catalogueMealId,
    catalogueVersion: standardCatalogue.version,
    saveToLibrary: false,
  });
  return recipe.recipeId;
}

function validateProposalRequest({
  fromDate,
  variant,
}: {
  fromDate: string;
  variant: number;
}) {
  if (!isPlanDate(fromDate)) {
    throwInvalidPlan("The proposal start date is invalid.");
  }
  if (!Number.isInteger(variant) || variant < 1 || variant > 100) {
    throwInvalidPlan("The proposal variant is invalid.");
  }
}

async function createPlanFromGuestMealChoices(
  ctx: MutationCtx,
  {
    ownerId,
    startDate,
    servings,
    mealChoices,
    createdAt,
  }: {
    ownerId: Id<"users">;
    startDate: string;
    servings: number;
    mealChoices: ReadonlyArray<{
      date: string;
      catalogueMealId: string | null;
    }>;
    createdAt: number;
  },
) {
  if (!isPlanDays(mealChoices.length)) {
    throw new Error("A meal plan must span between 3 and 7 consecutive days.");
  }

  const plannedChoices = mealChoices.filter(
    (choice): choice is { date: string; catalogueMealId: string } =>
      choice.catalogueMealId !== null,
  );
  if (plannedChoices.length === 0) {
    throwInvalidPlan("Save at least one dinner before keeping this plan.");
  }

  const mealPlanId = await ctx.db.insert("mealPlans", {
    ownerId,
    startDate,
    endDate: addDaysToPlanDate(startDate, mealChoices.length - 1),
    servings,
    status: "active",
    createdAt,
    updatedAt: createdAt,
  });

  for (const choice of plannedChoices) {
    const recipeId = await resolveRecipeReference(ctx, ownerId, {
      type: "catalogue",
      catalogueMealId: choice.catalogueMealId,
    });
    await ctx.db.insert("mealSlots", {
      mealPlanId,
      ownerId,
      date: choice.date,
      recipeId,
      status: "planned",
      createdAt,
      updatedAt: createdAt,
    });
  }

  await syncShoppingListForPlan(ctx, ownerId, mealPlanId);

  return mealPlanId;
}

async function createPlanFromRecipeChoices(
  ctx: MutationCtx,
  {
    ownerId,
    mealChoices,
    servings,
    createdAt,
  }: {
    ownerId: Id<"users">;
    mealChoices: readonly PlanRecipeChoice[];
    servings: number;
    createdAt: number;
  },
) {
  const firstChoice = mealChoices[0];
  const lastChoice = mealChoices.at(-1);
  if (firstChoice === undefined || lastChoice === undefined) {
    throw new Error("A meal plan must contain at least one meal.");
  }

  const mealPlanId = await ctx.db.insert("mealPlans", {
    ownerId,
    startDate: firstChoice.date,
    endDate: lastChoice.date,
    servings,
    status: "active",
    createdAt,
    updatedAt: createdAt,
  });

  for (const choice of mealChoices) {
    const recipeId = await resolveRecipeReference(ctx, ownerId, choice.recipe);
    await ctx.db.insert("mealSlots", {
      mealPlanId,
      ownerId,
      date: choice.date,
      recipeId,
      status: choice.status,
      createdAt,
      updatedAt: createdAt,
    });
  }

  await syncShoppingListForPlan(ctx, ownerId, mealPlanId);

  return mealPlanId;
}

function validateGuestPlan({
  claimKey,
  catalogueVersion,
  planStartDate,
  servings,
  mealChoices,
}: {
  claimKey: string;
  catalogueVersion: number;
  planStartDate: string;
  servings: number;
  mealChoices: Array<{ date: string; catalogueMealId: string | null }>;
}): "valid" | "catalogue_unsupported" {
  if (!isGuestClaimKey(claimKey)) {
    throwInvalidPlan("The plan claim key is invalid.");
  }
  if (!Number.isInteger(catalogueVersion) || catalogueVersion < 1) {
    throwInvalidPlan("The catalogue version is invalid.");
  }
  if (!isPlanDate(planStartDate) || !isPlanDays(mealChoices.length)) {
    throwInvalidPlan(
      "The plan must contain between 3 and 7 consecutive dates.",
    );
  }
  if (
    !Number.isInteger(servings) ||
    servings < MINIMUM_PLAN_SERVINGS ||
    servings > MAXIMUM_PLAN_SERVINGS
  ) {
    throwInvalidPlan("The plan serving count is invalid.");
  }

  for (let index = 0; index < mealChoices.length; index += 1) {
    const choice = mealChoices[index]!;
    if (choice.date !== addDaysToPlanDate(planStartDate, index)) {
      throwInvalidPlan("The plan contains an invalid date.");
    }
  }

  if (catalogueVersion !== standardCatalogue.version) {
    return "catalogue_unsupported";
  }

  let plannedMealCount = 0;
  for (const choice of mealChoices) {
    if (choice.catalogueMealId === null) continue;
    plannedMealCount += 1;
    if (
      findStandardCatalogueMeal(choice.catalogueMealId, catalogueVersion) ===
      null
    ) {
      throwInvalidPlan("The plan contains an invalid catalogue meal.");
    }
  }
  if (plannedMealCount === 0) {
    throwInvalidPlan("Save at least one dinner before keeping this plan.");
  }

  return "valid";
}

function throwInvalidPlan(message: string): never {
  throw new ConvexError({ code: "INVALID_GUEST_PLAN", message });
}

function validateActivePlanAdjustment({
  planDays,
  startDate,
  servings,
}: {
  planDays: number;
  startDate: string;
  servings: number;
}) {
  if (
    !Number.isInteger(planDays) ||
    planDays < minimumAdjustablePlanDays ||
    planDays > maximumAdjustablePlanDays
  ) {
    throwInvalidPlan(
      `A saved plan must span between ${minimumAdjustablePlanDays} and ${maximumAdjustablePlanDays} days.`,
    );
  }
  if (!isPlanDate(startDate)) {
    throwInvalidPlan("The plan start date is invalid.");
  }
  if (
    !Number.isInteger(servings) ||
    servings < MINIMUM_PLAN_SERVINGS ||
    servings > MAXIMUM_PLAN_SERVINGS
  ) {
    throwInvalidPlan(
      `Servings must be between ${MINIMUM_PLAN_SERVINGS} and ${MAXIMUM_PLAN_SERVINGS}.`,
    );
  }
}

function planDayOffset(startDate: string, date: string) {
  if (!isPlanDate(startDate) || !isPlanDate(date)) return Number.NaN;
  const [startYear, startMonth, startDay] = startDate.split("-").map(Number);
  const [year, month, day] = date.split("-").map(Number);
  const start = Date.UTC(startYear!, startMonth! - 1, startDay!);
  const end = Date.UTC(year!, month! - 1, day!);
  return Math.round((end - start) / 86_400_000);
}
