import { ConvexError, v } from "convex/values";
import {
  addDaysToPlanDate,
  GUEST_DRAFT_SCHEMA_VERSION,
  GUEST_PLAN_DAYS,
  isGuestClaimKey,
  isPlanDate,
} from "../src/lib/domain/guest-draft";
import {
  findStandardCatalogueMeal,
  standardCatalogue,
} from "../src/lib/domain/standard-catalogue";
import {
  rotatingMealPlanSelectionStrategy,
  selectRankedPlanCandidates,
} from "../src/lib/domain/meal-plan-selection";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { requireAuthSubject } from "./lib/auth";
import { getOrCreateCatalogueRecipe } from "./lib/catalogueRecipes";

const maximumPlanSlots = 31;
const maximumActivePlanRecovery = 10;
const maximumPersonalPlanCandidates = 50;
const catalogueMealIds = standardCatalogue.meals.map((meal) => meal.id);

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
  status: v.literal("active"),
  hasActivePlanConflict: v.boolean(),
  mealSlots: v.array(mealSlotViewValidator),
});

const mealChoiceValidator = v.object({
  date: v.string(),
  catalogueMealId: v.string(),
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
  v.object({
    status: v.literal("date_conflict"),
    dates: v.array(v.string()),
  }),
  v.object({ status: v.literal("active_plan_exists") }),
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

const startNewResultValidator = v.object({
  status: v.literal("started"),
  mealPlanId: v.id("mealPlans"),
});

const resolveActivePlanConflictResultValidator = v.union(
  v.object({ status: v.literal("resolved") }),
  v.object({ status: v.literal("not_found") }),
  v.object({ status: v.literal("too_many_active_plans") }),
);

export const getCurrent = query({
  args: {},
  returns: v.union(mealPlanViewValidator, v.null()),
  handler: async (ctx) => {
    const ownerSubject = await requireAuthSubject(ctx);
    const activePlanState = await getActivePlanState(ctx, ownerSubject);
    const mealPlan = activePlanState.mealPlan;

    if (mealPlan === null) return null;

    const mealSlots = await getPlanSlots(ctx, mealPlan._id);

    const mealSlotViews = [];
    for (const mealSlot of mealSlots) {
      const recipe = await ctx.db.get(mealSlot.recipeId);
      if (recipe === null || recipe.ownerSubject !== ownerSubject) {
        mealSlotViews.push({
          _id: mealSlot._id,
          date: mealSlot.date,
          recipeId: mealSlot.recipeId,
          isAvailable: false,
          catalogueMealId: null,
          catalogueMealSlug: null,
          title: "Recipe unavailable",
          prepMinutes: null,
          cookMinutes: null,
          status: mealSlot.status,
        });
        continue;
      }

      const catalogueMeal =
        recipe.source.type === "catalogue"
          ? findStandardCatalogueMeal(
              recipe.source.catalogueMealId,
              recipe.source.catalogueVersion,
            )
          : null;

      mealSlotViews.push({
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
        prepMinutes: recipe.prepMinutes ?? null,
        cookMinutes: recipe.cookMinutes ?? null,
        status: mealSlot.status,
      });
    }

    return {
      _id: mealPlan._id,
      startDate: mealPlan.startDate,
      endDate: mealPlan.endDate,
      status: "active" as const,
      hasActivePlanConflict: activePlanState.hasConflict,
      mealSlots: mealSlotViews,
    };
  },
});

export const resolveActivePlanConflict = mutation({
  args: { keepMealPlanId: v.id("mealPlans") },
  returns: resolveActivePlanConflictResultValidator,
  handler: async (ctx, { keepMealPlanId }) => {
    const ownerSubject = await requireAuthSubject(ctx);
    const activePlans = await ctx.db
      .query("mealPlans")
      .withIndex("by_owner_and_status_and_updated_at", (q) =>
        q.eq("ownerSubject", ownerSubject).eq("status", "active"),
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
      }
    }
    await ctx.db.patch(keepMealPlanId, { updatedAt });

    return { status: "resolved" } as const;
  },
});

export const swapMeal = mutation({
  args: { mealSlotId: v.id("mealSlots") },
  returns: swapResultValidator,
  handler: async (ctx, { mealSlotId }) => {
    const ownerSubject = await requireAuthSubject(ctx);
    const mealSlot = await ctx.db.get(mealSlotId);
    if (mealSlot === null || mealSlot.ownerSubject !== ownerSubject) {
      return { status: "not_found" } as const;
    }

    const mealPlan = await getSingleActivePlan(ctx, ownerSubject);
    if (mealPlan === null || mealPlan._id !== mealSlot.mealPlanId) {
      return { status: "not_found" } as const;
    }

    const mealSlots = await getPlanSlots(ctx, mealPlan._id);
    const recipesBySlot = await resolvePlanRecipes(
      ctx,
      mealSlots,
      ownerSubject,
    );
    const currentRecipe = recipesBySlot.get(mealSlot._id);
    if (
      currentRecipe === undefined ||
      recipesBySlot.size !== mealSlots.length
    ) {
      return { status: "plan_unavailable" } as const;
    }

    const candidatePool = await getPlanningCandidates(ctx, ownerSubject);
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
      ownerSubject,
      replacement.recipe,
    );
    const updatedAt = Date.now();

    await ctx.db.patch(mealSlot._id, {
      recipeId: replacementRecipeId,
      status: "planned",
      updatedAt,
    });
    await ctx.db.patch(mealPlan._id, { updatedAt });

    return { status: "swapped" } as const;
  },
});

export const getRegenerationProposal = query({
  args: { fromDate: v.string(), variant: v.number() },
  returns: regenerationProposalResultValidator,
  handler: async (ctx, args) => {
    const ownerSubject = await requireAuthSubject(ctx);
    validateProposalRequest(args);
    const mealPlan = await getSingleActivePlan(ctx, ownerSubject);
    if (mealPlan === null) {
      return { status: "no_active_plan" } as const;
    }

    const proposal = await buildRegenerationProposal(
      ctx,
      mealPlan,
      ownerSubject,
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
    const ownerSubject = await requireAuthSubject(ctx);
    validateProposalRequest(args);
    const mealPlan = await getSingleActivePlan(ctx, ownerSubject);
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
      ownerSubject,
      args.fromDate,
      args.variant,
    );
    if (proposal.status !== "ready") return proposal;

    const updatedAt = Date.now();
    await ctx.db.patch(mealPlan._id, {
      status: "archived",
      updatedAt,
    });
    const mealPlanId = await createPlanFromRecipeChoices(ctx, {
      ownerSubject,
      mealChoices: proposal.mealChoices,
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
    const ownerSubject = await requireAuthSubject(ctx);
    const activePlan = await getSingleActivePlan(ctx, ownerSubject);
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
      previousPlan.ownerSubject !== ownerSubject ||
      previousPlan.status !== "archived"
    ) {
      return { status: "not_found" } as const;
    }

    const updatedAt = Date.now();
    await ctx.db.patch(activePlan._id, { status: "archived", updatedAt });
    await ctx.db.patch(previousPlan._id, { status: "active", updatedAt });

    return { status: "restored" } as const;
  },
});

export const startNew = mutation({
  args: { startDate: v.string() },
  returns: startNewResultValidator,
  handler: async (ctx, { startDate }) => {
    const ownerSubject = await requireAuthSubject(ctx);
    if (!isPlanDate(startDate)) {
      throwInvalidPlan("The plan start date is invalid.");
    }

    const currentPlan = await getSingleActivePlan(ctx, ownerSubject);
    const updatedAt = Date.now();
    if (currentPlan !== null) {
      await ctx.db.patch(currentPlan._id, {
        status: "archived",
        updatedAt,
      });
    }

    const selectedMealIds = rotatingMealPlanSelectionStrategy({
      candidateMealIds: catalogueMealIds,
      numberOfMeals: GUEST_PLAN_DAYS,
      offset: planDateOffset(startDate),
    });
    const mealPlanId = await createPlanFromCatalogueMeals(ctx, {
      ownerSubject,
      startDate,
      catalogueMealIds: selectedMealIds,
      createdAt: updatedAt,
    });

    return { status: "started", mealPlanId } as const;
  },
});

export const claimGuestDraft = mutation({
  args: {
    claimKey: v.string(),
    schemaVersion: v.literal(GUEST_DRAFT_SCHEMA_VERSION),
    catalogueVersion: v.number(),
    planStartDate: v.string(),
    mealChoices: v.array(mealChoiceValidator),
  },
  returns: claimResultValidator,
  handler: async (
    ctx,
    { claimKey, catalogueVersion, planStartDate, mealChoices },
  ) => {
    const ownerSubject = await requireAuthSubject(ctx);
    const validation = validateGuestPlan({
      claimKey,
      catalogueVersion,
      planStartDate,
      mealChoices,
    });
    const existingClaim = await ctx.db
      .query("guestClaims")
      .withIndex("by_owner_and_claim_key", (q) =>
        q.eq("ownerSubject", ownerSubject).eq("claimKey", claimKey),
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

    const activePlan = await getSingleActivePlan(ctx, ownerSubject);
    const activeSlots =
      activePlan === null ? [] : await getPlanSlots(ctx, activePlan._id);
    const activeDates = new Set(activeSlots.map((slot) => slot.date));
    const conflictingDates = mealChoices
      .map((choice) => choice.date)
      .filter((date) => activeDates.has(date));
    if (conflictingDates.length > 0) {
      return { status: "date_conflict", dates: conflictingDates } as const;
    }
    if (activePlan !== null) {
      return { status: "active_plan_exists" } as const;
    }

    const claimedAt = Date.now();
    const mealPlanId = await createPlanFromCatalogueMeals(ctx, {
      ownerSubject,
      startDate: planStartDate,
      catalogueMealIds: mealChoices.map((choice) => choice.catalogueMealId),
      createdAt: claimedAt,
    });

    await ctx.db.insert("guestClaims", {
      ownerSubject,
      claimKey,
      mealPlanId,
      claimedAt,
    });

    return { status: "claimed", mealPlanId } as const;
  },
});

async function getSingleActivePlan(
  ctx: QueryCtx | MutationCtx,
  ownerSubject: string,
): Promise<Doc<"mealPlans"> | null> {
  const state = await getActivePlanState(ctx, ownerSubject);
  if (state.hasConflict) {
    throw new Error("Resolve multiple active meal plans before continuing.");
  }
  return state.mealPlan;
}

async function getActivePlanState(
  ctx: QueryCtx | MutationCtx,
  ownerSubject: string,
) {
  const activePlans = await ctx.db
    .query("mealPlans")
    .withIndex("by_owner_and_status_and_updated_at", (q) =>
      q.eq("ownerSubject", ownerSubject).eq("status", "active"),
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
  ownerSubject: string,
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
  const recipesBySlot = await resolvePlanRecipes(ctx, mealSlots, ownerSubject);
  if (mealSlots.length === 0 || recipesBySlot.size !== mealSlots.length) {
    return { status: "plan_unavailable" };
  }

  const replaceableSlots = mealSlots.filter((slot) => slot.date >= fromDate);
  if (replaceableSlots.length === 0) {
    return { status: "no_future_meals" };
  }

  const candidatePool = await getPlanningCandidates(ctx, ownerSubject);
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
  ownerSubject: string,
) {
  const recipesBySlot = new Map<Id<"mealSlots">, Doc<"recipes">>();
  for (const mealSlot of mealSlots) {
    const recipe = await ctx.db.get(mealSlot.recipeId);
    if (recipe?.ownerSubject === ownerSubject) {
      recipesBySlot.set(mealSlot._id, recipe);
    }
  }
  return recipesBySlot;
}

async function getPlanningCandidates(
  ctx: QueryCtx | MutationCtx,
  ownerSubject: string,
) {
  const savedRecipes = await ctx.db
    .query("recipes")
    .withIndex("by_owner_and_saved_at", (q) =>
      q.eq("ownerSubject", ownerSubject).gt("savedAt", 0),
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
  ownerSubject: string,
  recipeReference: PlanRecipeReference,
) {
  if (recipeReference.type === "existing") {
    const recipe = await ctx.db.get(recipeReference.recipeId);
    if (recipe?.ownerSubject !== ownerSubject) {
      throw new Error("A selected personal recipe could not be resolved.");
    }
    return recipe._id;
  }

  const recipe = await getOrCreateCatalogueRecipe(ctx, {
    ownerSubject,
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

async function createPlanFromCatalogueMeals(
  ctx: MutationCtx,
  {
    ownerSubject,
    startDate,
    catalogueMealIds: selectedMealIds,
    createdAt,
  }: {
    ownerSubject: string;
    startDate: string;
    catalogueMealIds: readonly string[];
    createdAt: number;
  },
) {
  return createPlanFromRecipeChoices(ctx, {
    ownerSubject,
    mealChoices: selectedMealIds.map((catalogueMealId, index) => ({
      date: addDaysToPlanDate(startDate, index),
      recipe: { type: "catalogue" as const, catalogueMealId },
      status: "planned" as const,
    })),
    createdAt,
  });
}

async function createPlanFromRecipeChoices(
  ctx: MutationCtx,
  {
    ownerSubject,
    mealChoices,
    createdAt,
  }: {
    ownerSubject: string;
    mealChoices: readonly PlanRecipeChoice[];
    createdAt: number;
  },
) {
  const firstChoice = mealChoices[0];
  const lastChoice = mealChoices.at(-1);
  if (firstChoice === undefined || lastChoice === undefined) {
    throw new Error("A meal plan must contain at least one meal.");
  }

  const mealPlanId = await ctx.db.insert("mealPlans", {
    ownerSubject,
    startDate: firstChoice.date,
    endDate: lastChoice.date,
    status: "active",
    createdAt,
    updatedAt: createdAt,
  });

  for (const choice of mealChoices) {
    const recipeId = await resolveRecipeReference(
      ctx,
      ownerSubject,
      choice.recipe,
    );
    await ctx.db.insert("mealSlots", {
      mealPlanId,
      ownerSubject,
      date: choice.date,
      recipeId,
      status: choice.status,
      createdAt,
      updatedAt: createdAt,
    });
  }

  return mealPlanId;
}

function planDateOffset(planDate: string) {
  const [year, month, day] = planDate.split("-").map(Number);
  return Math.floor(Date.UTC(year!, month! - 1, day!) / 86_400_000);
}

function validateGuestPlan({
  claimKey,
  catalogueVersion,
  planStartDate,
  mealChoices,
}: {
  claimKey: string;
  catalogueVersion: number;
  planStartDate: string;
  mealChoices: Array<{ date: string; catalogueMealId: string }>;
}): "valid" | "catalogue_unsupported" {
  if (!isGuestClaimKey(claimKey)) {
    throwInvalidPlan("The plan claim key is invalid.");
  }
  if (!Number.isInteger(catalogueVersion) || catalogueVersion < 1) {
    throwInvalidPlan("The catalogue version is invalid.");
  }
  if (!isPlanDate(planStartDate) || mealChoices.length !== GUEST_PLAN_DAYS) {
    throwInvalidPlan("The plan must contain seven consecutive dates.");
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

  for (const choice of mealChoices) {
    if (
      findStandardCatalogueMeal(choice.catalogueMealId, catalogueVersion) ===
      null
    ) {
      throwInvalidPlan("The plan contains an invalid catalogue meal.");
    }
  }

  return "valid";
}

function throwInvalidPlan(message: string): never {
  throw new ConvexError({ code: "INVALID_GUEST_PLAN", message });
}
