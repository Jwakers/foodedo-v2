import { ConvexError, v } from "convex/values";
import {
  addDaysToPlanDate,
  GUEST_DRAFT_SCHEMA_VERSION,
  isPlanDate,
  isPlanDays,
  planDatesRemovedByShortening,
} from "../src/lib/domain/guest-draft";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { requireUserId } from "./lib/auth";
import { getCatalogueMeal } from "./lib/catalogue";
import {
  addPlanDayResultValidator,
  adjustActivePlanResultValidator,
  applyProposalResultValidator,
  archivedMealPlanSummaryValidator,
  claimResultValidator,
  mealChoiceValidator,
  mealPlanViewValidator,
  planMealResultValidator,
  regenerationProposalResultValidator,
  resolveActivePlanConflictResultValidator,
  swapResultValidator,
  undoReplacementResultValidator,
} from "./lib/mealPlans/contracts";
import {
  createPlanFromGuestMealChoices,
  createPlanFromRecipeChoices,
  recordKeptPlanMeals,
  resolveRecipeReference,
} from "./lib/mealPlans/creation";
import {
  defaultPlanServings,
  maximumAdjustablePlanDays,
  type PlanCandidate,
} from "./lib/mealPlans/model";
import {
  buildRegenerationProposal,
  candidateKeyForRecipe,
  getPlanningCandidates,
  getPlanRecipesForSelection,
  getRecentPlansForSelection,
  selectAdditionalPlanCandidates,
  selectPlanCandidateKeys,
} from "./lib/mealPlans/selection";
import {
  throwInvalidPlan,
  validateActivePlanAdjustment,
  validateGuestPlan,
  validateProposalRequest,
} from "./lib/mealPlans/validation";
import {
  buildMealPlanView,
  getSingleActivePlan,
  resolveExpectedActivePlan,
  resolvePlanRecipes,
} from "./lib/mealPlans/views";
import {
  getMealSelectionSignals,
  recipeSelectionKey,
  recordMealSelectionOutcome,
} from "./lib/mealSelection";
import { recordSavedPlanIntroduction } from "./lib/onboarding";
import { patchPlanningPreferences } from "./lib/planningPreferences";
import {
  archiveShoppingListForPlan,
  carryShoppingState,
  syncShoppingListForPlan,
} from "./lib/shoppingListSync";
import { readSpace, requireSpace, spaceArgs } from "./lib/spaces";

import {
  getActivePlanState,
  getPlanSlots,
  maximumPlanSlots,
} from "./lib/activePlan";
const maximumActivePlanRecovery = 10;
const maximumRecentArchivedPlans = 11;

export const getCurrent = query({
  args: { ...spaceArgs },
  returns: v.union(mealPlanViewValidator, v.null()),
  handler: async (ctx, args) => {
    const ownerId = await readSpace(ctx, args.householdId);
    if (ownerId === null) return null;
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
  args: { ...spaceArgs },
  returns: v.array(archivedMealPlanSummaryValidator),
  handler: async (ctx, args) => {
    const ownerId = await readSpace(ctx, args.householdId);
    if (ownerId === null) return [];
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

/** Bounded catalogue-only memory for the local signed-in plan generator. */
export const getRecentCatalogueSelectionHistory = query({
  args: { ...spaceArgs },
  returns: v.array(v.array(v.string())),
  handler: async (ctx, args) => {
    const ownerId = await readSpace(ctx, args.householdId);
    if (ownerId === null) return [];
    const plans = await getRecentPlansForSelection(ctx, ownerId);
    const history: string[][] = [];
    for (const plan of plans) {
      const recipes = await getPlanRecipesForSelection(ctx, plan, ownerId);
      history.push(
        recipes.flatMap((recipe) =>
          recipe.source.type === "catalogue"
            ? [recipe.source.catalogueMealId]
            : [],
        ),
      );
    }
    return history;
  },
});

/** Aggregate public-meal facts for the local generator; never returns private recipes. */
export const getCatalogueSelectionSignals = query({
  args: { ...spaceArgs },
  returns: v.array(
    v.object({
      catalogueMealId: v.string(),
      isSaved: v.boolean(),
      savedByMemberKeys: v.array(v.string()),
      dismissalCount: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const ownerId = await readSpace(ctx, args.householdId);
    if (ownerId === null) return [];
    const signals = await getMealSelectionSignals(ctx, ownerId);
    return [...signals].flatMap(([key, signal]) =>
      key.startsWith("catalogue:")
        ? [{ catalogueMealId: key.slice("catalogue:".length), ...signal }]
        : [],
    );
  },
});

/** Hydrate one archived week only after the user selects it. */
export const getArchived = query({
  args: { ...spaceArgs, mealPlanId: v.id("mealPlans") },
  returns: v.union(mealPlanViewValidator, v.null()),
  handler: async (ctx, { mealPlanId, householdId }) => {
    const ownerId = await readSpace(ctx, householdId);
    if (ownerId === null) return null;
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
  args: { ...spaceArgs, keepMealPlanId: v.id("mealPlans") },
  returns: resolveActivePlanConflictResultValidator,
  handler: async (ctx, { keepMealPlanId, householdId }) => {
    const ownerId = await requireSpace(ctx, householdId);
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

    const updatedAt = nextMealPlanUpdatedAt(...activePlans);
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
  args: {
    ...spaceArgs,
    mealSlotId: v.id("mealSlots"),
    expectedUpdatedAt: v.optional(v.number()),
  },
  returns: swapResultValidator,
  handler: async (ctx, { mealSlotId, householdId, expectedUpdatedAt }) => {
    const ownerId = await requireSpace(ctx, householdId);
    const mealSlot = await ctx.db.get(mealSlotId);
    if (mealSlot === null || mealSlot.ownerId !== ownerId) {
      return { status: "not_found" } as const;
    }

    const activePlanState = await getActivePlanState(ctx, ownerId);
    if (activePlanState.hasConflict) {
      return { status: "plan_unavailable" } as const;
    }
    const mealPlan = activePlanState.mealPlan;
    if (mealPlan === null || mealPlan._id !== mealSlot.mealPlanId) {
      return { status: "not_found" } as const;
    }

    if (
      expectedUpdatedAt !== undefined &&
      mealPlan.updatedAt !== expectedUpdatedAt
    )
      return { status: "plan_unavailable" } as const;
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
    const [replacementKey] = await selectPlanCandidateKeys({
      ctx,
      ownerId,
      candidatePool,
      excludedCandidateKeys: [...recipesBySlot.values()].map(
        candidateKeyForRecipe,
      ),
      retainedRecipes: mealSlots
        .filter((slot) => slot._id !== mealSlot._id)
        .map((slot) => recipesBySlot.get(slot._id)!),
      numberOfMeals: 1,
      variationKey: `swap:${mealPlan._id}:${mealPlan.updatedAt}:${mealSlot._id}:${currentCandidateKey}`,
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
    const updatedAt = nextMealPlanUpdatedAt(mealPlan);
    if (replacement.key !== currentCandidateKey) {
      await recordMealSelectionOutcome(ctx, {
        ownerId,
        mealPlanId: mealPlan._id,
        date: mealSlot.date,
        candidateKey: currentCandidateKey,
        outcome: "dismissed",
        updatedAt,
      });
      await recordMealSelectionOutcome(ctx, {
        ownerId,
        mealPlanId: mealPlan._id,
        date: mealSlot.date,
        candidateKey: replacement.key,
        outcome: "kept",
        updatedAt,
      });
    }

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

/** Puts one chosen catalogue recipe on a day of the active plan. */
export const planMeal = mutation({
  args: {
    ...spaceArgs,
    mealPlanId: v.id("mealPlans"),
    expectedUpdatedAt: v.number(),
    date: v.string(),
    catalogueMealId: v.string(),
    catalogueVersion: v.number(),
  },
  returns: planMealResultValidator,
  handler: async (ctx, args) => {
    const ownerId = await requireSpace(ctx, args.householdId);
    if (!isPlanDate(args.date)) {
      throwInvalidPlan("The plan date is invalid.");
    }

    const activePlan = await resolveExpectedActivePlan(ctx, ownerId, args);
    if (activePlan.status !== "ready") return activePlan;
    const mealPlan = activePlan.mealPlan;
    if (args.date < mealPlan.startDate || args.date > mealPlan.endDate) {
      throwInvalidPlan("That date is not in this plan.");
    }
    if (
      (await getCatalogueMeal(
        ctx,
        args.catalogueMealId,
        args.catalogueVersion,
      )) === null
    ) {
      return { status: "catalogue_unsupported" } as const;
    }

    const mealSlots = await getPlanSlots(ctx, mealPlan._id);
    const matchingSlots = mealSlots.filter((slot) => slot.date === args.date);
    if (matchingSlots.length > 1) {
      return { status: "plan_unavailable" } as const;
    }
    const existingSlot = matchingSlots[0];
    if (existingSlot !== undefined && existingSlot.status !== "planned") {
      return { status: "plan_unavailable" } as const;
    }
    const recipeId = await resolveRecipeReference(ctx, ownerId, {
      type: "catalogue",
      catalogueMealId: args.catalogueMealId,
      catalogueVersion: args.catalogueVersion,
    });
    if (
      existingSlot?.recipeId === recipeId &&
      existingSlot.status === "planned"
    ) {
      return { status: "planned" } as const;
    }

    const updatedAt = nextMealPlanUpdatedAt(mealPlan);
    if (existingSlot === undefined) {
      await ctx.db.insert("mealSlots", {
        mealPlanId: mealPlan._id,
        ownerId,
        date: args.date,
        recipeId,
        status: "planned",
        createdAt: updatedAt,
        updatedAt,
      });
    } else {
      await ctx.db.patch(existingSlot._id, {
        recipeId,
        status: "planned",
        updatedAt,
      });
    }
    if (existingSlot) {
      const oldRecipe = await ctx.db.get(existingSlot.recipeId);
      if (
        oldRecipe &&
        oldRecipe.ownerId === ownerId &&
        recipeSelectionKey(oldRecipe) !== `catalogue:${args.catalogueMealId}`
      ) {
        await recordMealSelectionOutcome(ctx, {
          ownerId,
          mealPlanId: mealPlan._id,
          date: args.date,
          candidateKey: recipeSelectionKey(oldRecipe),
          outcome: "dismissed",
          updatedAt,
        });
      }
    }
    await recordMealSelectionOutcome(ctx, {
      ownerId,
      mealPlanId: mealPlan._id,
      date: args.date,
      candidateKey: `catalogue:${args.catalogueMealId}`,
      outcome: "kept",
      updatedAt,
    });
    await ctx.db.patch(mealPlan._id, { updatedAt });
    await syncShoppingListForPlan(ctx, ownerId, mealPlan._id);

    return { status: "planned" } as const;
  },
});

/** Extends the active plan by one day and puts a chosen recipe on it. */
export const addPlanDay = mutation({
  args: {
    ...spaceArgs,
    mealPlanId: v.id("mealPlans"),
    expectedUpdatedAt: v.number(),
    catalogueMealId: v.string(),
    catalogueVersion: v.number(),
  },
  returns: addPlanDayResultValidator,
  handler: async (ctx, args) => {
    const ownerId = await requireSpace(ctx, args.householdId);
    const activePlan = await resolveExpectedActivePlan(ctx, ownerId, args);
    if (activePlan.status !== "ready") return activePlan;
    const mealPlan = activePlan.mealPlan;

    const planDays = planDayOffset(mealPlan.startDate, mealPlan.endDate) + 1;
    if (planDays >= maximumAdjustablePlanDays) {
      return { status: "plan_full" } as const;
    }
    if (
      (await getCatalogueMeal(
        ctx,
        args.catalogueMealId,
        args.catalogueVersion,
      )) === null
    ) {
      return { status: "catalogue_unsupported" } as const;
    }

    const date = addDaysToPlanDate(mealPlan.endDate, 1);
    const mealSlots = await getPlanSlots(ctx, mealPlan._id);
    if (mealSlots.some((slot) => slot.date === date)) {
      return { status: "plan_unavailable" } as const;
    }
    const recipeId = await resolveRecipeReference(ctx, ownerId, {
      type: "catalogue",
      catalogueMealId: args.catalogueMealId,
      catalogueVersion: args.catalogueVersion,
    });
    const updatedAt = nextMealPlanUpdatedAt(mealPlan);
    await ctx.db.insert("mealSlots", {
      mealPlanId: mealPlan._id,
      ownerId,
      date,
      recipeId,
      status: "planned",
      createdAt: updatedAt,
      updatedAt,
    });
    await recordMealSelectionOutcome(ctx, {
      ownerId,
      mealPlanId: mealPlan._id,
      date,
      candidateKey: `catalogue:${args.catalogueMealId}`,
      outcome: "kept",
      updatedAt,
    });
    await ctx.db.patch(mealPlan._id, { endDate: date, updatedAt });
    await syncShoppingListForPlan(ctx, ownerId, mealPlan._id);

    return { status: "planned", date } as const;
  },
});

export const getRegenerationProposal = query({
  args: { ...spaceArgs, variant: v.number() },
  returns: regenerationProposalResultValidator,
  handler: async (ctx, args) => {
    const ownerId = await readSpace(ctx, args.householdId);
    if (ownerId === null) return { status: "plan_unavailable" } as const;
    validateProposalRequest(args);
    const mealPlan = await getSingleActivePlan(ctx, ownerId);
    if (mealPlan === null) {
      return { status: "no_active_plan" } as const;
    }

    const proposal = await buildRegenerationProposal(
      ctx,
      mealPlan,
      ownerId,
      args.variant,
    );
    if (proposal.status !== "ready") return proposal;

    return {
      status: "ready" as const,
      sourcePlanId: mealPlan._id,
      sourceUpdatedAt: mealPlan.updatedAt,
      variant: args.variant,
      mealSlots: proposal.mealSlots,
    };
  },
});

export const applyRegenerationProposal = mutation({
  args: {
    ...spaceArgs,
    sourcePlanId: v.id("mealPlans"),
    sourceUpdatedAt: v.number(),
    variant: v.number(),
  },
  returns: applyProposalResultValidator,
  handler: async (ctx, args) => {
    const ownerId = await requireSpace(ctx, args.householdId);
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
      args.variant,
    );
    if (proposal.status !== "ready") return proposal;

    const updatedAt = nextMealPlanUpdatedAt(mealPlan);
    await ctx.db.patch(mealPlan._id, {
      status: "archived",
      updatedAt,
    });
    await archiveShoppingListForPlan(ctx, ownerId, mealPlan._id, updatedAt);
    const mealPlanId = await createPlanFromRecipeChoices(ctx, {
      ownerId,
      mealChoices: proposal.mealChoices,
      startDate: mealPlan.startDate,
      endDate: mealPlan.endDate,
      servings: mealPlan.servings ?? defaultPlanServings,
      createdAt: updatedAt,
    });

    await carryShoppingState(ctx, mealPlan._id, mealPlanId);

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
    ...spaceArgs,
    currentMealPlanId: v.id("mealPlans"),
    previousMealPlanId: v.id("mealPlans"),
    currentUpdatedAt: v.number(),
  },
  returns: undoReplacementResultValidator,
  handler: async (
    ctx,
    { currentMealPlanId, previousMealPlanId, currentUpdatedAt, householdId },
  ) => {
    const ownerId = await requireSpace(ctx, householdId);
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

    const updatedAt = nextMealPlanUpdatedAt(activePlan, previousPlan);
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
    ...spaceArgs,
    mealPlanId: v.id("mealPlans"),
    expectedUpdatedAt: v.number(),
    planDays: v.number(),
    startDate: v.string(),
    servings: v.number(),
    persistForFuture: v.boolean(),
  },
  returns: adjustActivePlanResultValidator,
  handler: async (ctx, args) => {
    const ownerId = await requireSpace(ctx, args.householdId);
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
        mealPlan,
        mealSlots,
        addedDays,
        args.planDays,
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
        await requireUserId(ctx),
        {
          ...(isPlanDays(args.planDays)
            ? { usualPlanDays: args.planDays }
            : {}),
          usualServings: args.servings,
        },
        updatedAt,
      );
    }

    await recordKeptPlanMeals(ctx, ownerId, mealPlan._id, updatedAt);
    await syncShoppingListForPlan(ctx, ownerId, mealPlan._id);

    return { status: "adjusted", addedDays, removedDates } as const;
  },
});

export const claimGuestDraft = mutation({
  args: {
    ...spaceArgs,
    expectedPlanId: v.optional(v.union(v.id("mealPlans"), v.null())),
    expectedUpdatedAt: v.optional(v.number()),
    claimKey: v.string(),
    schemaVersion: v.literal(GUEST_DRAFT_SCHEMA_VERSION),
    planStartDate: v.string(),
    servings: v.number(),
    mealChoices: v.array(mealChoiceValidator),
    dismissedMeals: v.optional(
      v.array(v.object({ date: v.string(), catalogueMealId: v.string() })),
    ),
  },
  returns: claimResultValidator,
  handler: async (
    ctx,
    {
      claimKey,
      planStartDate,
      servings,
      mealChoices,
      dismissedMeals = [],
      householdId,
      expectedPlanId,
      expectedUpdatedAt,
    },
  ) => {
    const ownerId = await requireSpace(ctx, householdId);
    const actorId = await requireUserId(ctx);
    const validation = await validateGuestPlan(ctx, {
      claimKey,
      planStartDate,
      servings,
      mealChoices,
    });
    const existingClaim = await ctx.db
      .query("guestClaims")
      .withIndex("by_owner_and_claim_key", (q) =>
        q.eq("ownerId", actorId).eq("claimKey", claimKey),
      )
      .unique();

    if (existingClaim !== null) {
      const claimedPlan = await ctx.db.get(existingClaim.mealPlanId);
      if (!claimedPlan || claimedPlan.ownerId !== ownerId)
        throw new ConvexError("This draft was already saved in another space.");
      return {
        status: "already_claimed" as const,
        mealPlanId: existingClaim.mealPlanId,
      };
    }
    if (validation === "catalogue_unsupported") {
      return { status: "catalogue_unsupported" } as const;
    }

    if (
      dismissedMeals.length > 100 ||
      dismissedMeals.some(
        (entry) =>
          !mealChoices.some((choice) => choice.date === entry.date) ||
          entry.catalogueMealId.length < 1 ||
          entry.catalogueMealId.length > 200,
      )
    ) {
      throwInvalidPlan("The meal feedback is invalid.");
    }

    const activePlan = await getSingleActivePlan(ctx, ownerId);
    if (
      (householdId && expectedPlanId === undefined) ||
      (expectedPlanId !== undefined &&
        ((activePlan?._id ?? null) !== expectedPlanId ||
          (expectedUpdatedAt !== undefined &&
            activePlan !== null &&
            activePlan.updatedAt !== expectedUpdatedAt)))
    ) {
      throw new ConvexError({
        code: "PLAN_CHANGED",
        message: "This week changed. Review the latest week before saving.",
      });
    }
    const claimedAt = nextMealPlanUpdatedAt(
      ...(activePlan === null ? [] : [activePlan]),
    );
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

    for (const entry of dismissedMeals) {
      if (
        mealChoices.some(
          (choice) =>
            choice.date === entry.date &&
            choice.catalogueMealId === entry.catalogueMealId,
        )
      )
        continue;
      await recordMealSelectionOutcome(ctx, {
        ownerId,
        mealPlanId,
        date: entry.date,
        candidateKey: `catalogue:${entry.catalogueMealId}`,
        outcome: "dismissed",
        updatedAt: claimedAt,
      });
    }

    await recordSavedPlanIntroduction(ctx, actorId, ownerId, mealPlanId);

    if (activePlan) await carryShoppingState(ctx, activePlan._id, mealPlanId);

    await ctx.db.insert("guestClaims", {
      ownerId: actorId,
      claimKey,
      mealPlanId,
      claimedAt,
    });

    return { status: "claimed", mealPlanId } as const;
  },
});

function planDayOffset(startDate: string, date: string) {
  if (!isPlanDate(startDate) || !isPlanDate(date)) return Number.NaN;
  const [startYear, startMonth, startDay] = startDate.split("-").map(Number);
  const [year, month, day] = date.split("-").map(Number);
  const start = Date.UTC(startYear!, startMonth! - 1, startDay!);
  const end = Date.UTC(year!, month! - 1, day!);
  return Math.round((end - start) / 86_400_000);
}

function nextMealPlanUpdatedAt(...plans: Array<Doc<"mealPlans">>) {
  return Math.max(Date.now(), ...plans.map((plan) => plan.updatedAt + 1));
}

/** Removing one meal never retargets a newer active plan. */
export const removeMeal = mutation({
  args: {
    ...spaceArgs,
    mealPlanId: v.id("mealPlans"),
    expectedUpdatedAt: v.number(),
    date: v.string(),
  },
  returns: v.union(
    v.object({ status: v.literal("removed") }),
    v.object({ status: v.literal("plan_changed") }),
    v.object({ status: v.literal("no_active_plan") }),
    v.object({ status: v.literal("plan_unavailable") }),
    v.object({ status: v.literal("last_meal") }),
  ),
  handler: async (ctx, args) => {
    const ownerId = await requireSpace(ctx, args.householdId);
    const active = await resolveExpectedActivePlan(ctx, ownerId, args);
    if (active.status !== "ready") return active;
    const slots = await getPlanSlots(ctx, active.mealPlan._id);
    const slot = slots.find((slot) => slot.date === args.date);
    if (!slot) return { status: "plan_unavailable" } as const;
    if (slots.length <= 1) return { status: "last_meal" } as const;
    const recipe = await ctx.db.get(slot.recipeId);
    if (!recipe || recipe.ownerId !== ownerId)
      return { status: "plan_unavailable" } as const;
    await recordMealSelectionOutcome(ctx, {
      ownerId,
      mealPlanId: active.mealPlan._id,
      date: slot.date,
      candidateKey: recipeSelectionKey(recipe),
      outcome: "dismissed",
      updatedAt: nextMealPlanUpdatedAt(active.mealPlan),
    });
    await ctx.db.delete(slot._id);
    await ctx.db.patch(active.mealPlan._id, {
      updatedAt: nextMealPlanUpdatedAt(active.mealPlan),
    });
    await syncShoppingListForPlan(ctx, ownerId, active.mealPlan._id);
    return { status: "removed" } as const;
  },
});
