import { stream, type QueryStream } from "convex-helpers/server/stream";
import schema from "./schema";
import type { Doc } from "./_generated/dataModel";
import {
  listingFilterArgs,
  listingPaginationOptions,
  matchesRecipeListing,
} from "./lib/recipeListing";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { selectDiscoveryMeals } from "../src/lib/domain/recipe-discovery";
import { RECIPE_LIMITS } from "../src/lib/domain/recipes";
import { isPlanDate } from "../src/lib/domain/guest-draft";
import { getSavedCatalogueRecipes } from "./lib/catalogueRecipes";
import {
  getActivePlanState,
  getPlanSlots,
  maximumPlanSlots,
} from "./lib/activePlan";
import { requireSpace, spaceArgs } from "./lib/spaces";
import { requireUserId } from "./lib/auth";
import { internalMutation, query } from "./_generated/server";
import {
  catalogueMealSummaryValidator,
  catalogueMealViewValidator,
  catalogueViewValidator,
} from "./lib/recipeValidators";
import {
  catalogueBrowseKeys,
  catalogueMealSummary,
  catalogueMealView,
  getCatalogueMeal,
  getCurrentCatalogueMeals,
} from "./lib/catalogue";

const catalogueMealReferenceValidator = v.object({
  catalogueMealId: v.string(),
  catalogueVersion: v.number(),
});
const maximumExactMealReads = 20;

export const getCurrent = query({
  args: {},
  returns: v.union(catalogueViewValidator, v.null()),
  handler: async (ctx) => {
    const meals = await getCurrentCatalogueMeals(ctx);
    if (meals.length === 0) return null;
    return {
      meals: await Promise.all(
        meals.map((meal) => catalogueMealSummary(ctx, meal)),
      ),
    };
  },
});

/** Rank on the server and resolve images only for the six selected recipes. */
export const getDiscovery = query({
  args: {
    ...spaceArgs,
    day: v.string(),
    localPlannedMealIds: v.array(v.string()),
  },
  returns: v.array(catalogueMealSummaryValidator),
  handler: async (ctx, { householdId, day, localPlannedMealIds }) => {
    if (!isPlanDate(day))
      throw new Error("A valid local calendar day is required.");
    if (
      localPlannedMealIds.length > maximumPlanSlots ||
      localPlannedMealIds.some(
        (id) =>
          id.trim().length === 0 || id.length > RECIPE_LIMITS.catalogueMealId,
      )
    ) {
      throw new Error("Invalid local plan exclusions.");
    }
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity ? await requireUserId(ctx) : null;
    // Guests may supply local exclusions, but cannot read household data.
    const ownerId = householdId ? await requireSpace(ctx, householdId) : userId;
    const [meals, saved, active] = await Promise.all([
      getCurrentCatalogueMeals(ctx),
      userId ? getSavedCatalogueRecipes(ctx, userId) : [],
      ownerId ? getActivePlanState(ctx, ownerId) : null,
    ]);
    const savedMealIds = new Set(
      saved.flatMap((recipe) =>
        recipe.source.type === "catalogue"
          ? [recipe.source.catalogueMealId]
          : [],
      ),
    );
    let plannedMealIds = new Set(localPlannedMealIds);
    if (active?.mealPlan && ownerId) {
      const slots = await getPlanSlots(ctx, active.mealPlan._id);
      const recipes = await Promise.all(
        slots.map((slot) => ctx.db.get(slot.recipeId)),
      );
      // The saved plan is authoritative, matching the Week tab. Local draft
      // exclusions are used only when this space has no active saved plan.
      plannedMealIds = new Set(
        recipes.flatMap((recipe) =>
          recipe?.ownerId === ownerId && recipe.source.type === "catalogue"
            ? [recipe.source.catalogueMealId]
            : [],
        ),
      );
    }
    const selected = selectDiscoveryMeals(
      meals.map((meal) => ({
        id: meal.catalogueMealId,
        proteinCategory: meal.proteinCategory,
        prepMinutes: meal.prepMinutes,
        cookMinutes: meal.cookMinutes,
        costBand: meal.costBand,
        document: meal,
      })),
      {
        savedMealIds,
        plannedMealIds,
        day,
        viewerKey: identity?.subject ?? "guest",
      },
    );
    return await Promise.all(
      selected.map(({ document }) => catalogueMealSummary(ctx, document)),
    );
  },
});

export const getMeals = query({
  args: { meals: v.array(catalogueMealReferenceValidator) },
  returns: v.array(catalogueMealSummaryValidator),
  handler: async (ctx, { meals }) => {
    if (meals.length > maximumExactMealReads) {
      throw new Error(
        `At most ${maximumExactMealReads} catalogue meals can be read at once.`,
      );
    }
    const referenceKeys = new Set(
      meals.map(
        ({ catalogueMealId, catalogueVersion }) =>
          `${catalogueMealId}:${catalogueVersion}`,
      ),
    );
    if (referenceKeys.size !== meals.length) {
      throw new Error("Catalogue meal references must be unique.");
    }
    const resolved = await Promise.all(
      meals.map(({ catalogueMealId, catalogueVersion }) =>
        getCatalogueMeal(ctx, catalogueMealId, catalogueVersion),
      ),
    );
    return await Promise.all(
      resolved.flatMap((meal) =>
        meal === null ? [] : [catalogueMealSummary(ctx, meal)],
      ),
    );
  },
});

export const getMeal = query({
  args: { catalogueMealId: v.string(), catalogueVersion: v.number() },
  returns: v.union(catalogueMealViewValidator, v.null()),
  handler: async (ctx, { catalogueMealId, catalogueVersion }) => {
    const meal = await getCatalogueMeal(ctx, catalogueMealId, catalogueVersion);
    return meal === null ? null : await catalogueMealView(ctx, meal);
  },
});

export const getCurrentMealBySlug = query({
  args: { slug: v.string() },
  returns: v.union(catalogueMealViewValidator, v.null()),
  handler: async (ctx, { slug }) => {
    const meal = await ctx.db
      .query("catalogueMeals")
      .withIndex("by_status_and_slug", (q) =>
        q.eq("status", "published").eq("slug", slug),
      )
      .unique();
    return meal === null ? null : await catalogueMealView(ctx, meal);
  },
});

export const getSitemapMeals = query({
  args: {},
  returns: v.array(v.object({ slug: v.string(), publishedAt: v.number() })),
  handler: async (ctx) => {
    const meals = await getCurrentCatalogueMeals(ctx);
    return meals.map((meal) => ({
      slug: meal.slug,
      publishedAt: meal.publishedAt,
    }));
  },
});

export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    savedOnly: v.optional(v.boolean()),
    ...listingFilterArgs,
  },
  returns: paginationResultValidator(catalogueMealSummaryValidator),
  handler: async (ctx, args) => {
    let meals: QueryStream<Doc<"catalogueMeals">> = stream(ctx.db, schema)
      .query("catalogueMeals")
      .withIndex(
        args.sort === "quickest"
          ? "by_status_and_duration"
          : args.sort === "lowest-cost"
            ? "by_status_and_cost"
            : "by_status_and_position",
        (q) => q.eq("status", "published"),
      )
      // New additions have the highest stable position; edits retain their place.
      .order(
        args.sort === "quickest" || args.sort === "lowest-cost"
          ? "asc"
          : "desc",
      );
    const ownerId = args.savedOnly ? await requireUserId(ctx) : undefined;
    meals = meals.filterWith(async (meal) => {
      if (!matchesRecipeListing(meal, args)) return false;
      if (ownerId === undefined) return true;
      return (
        (await ctx.db
          .query("recipes")
          .withIndex("by_owner_and_catalogue_meal_and_saved_at", (q) =>
            q
              .eq("ownerId", ownerId)
              .eq("source.catalogueMealId", meal.catalogueMealId)
              .gt("savedAt", 0),
          )
          .first()) !== null
      );
    });
    const result = await meals.paginate(
      listingPaginationOptions(args.paginationOpts),
    );
    return {
      ...result,
      page: await Promise.all(
        result.page.map((meal) => catalogueMealSummary(ctx, meal)),
      ),
    };
  },
});

/** Run once after adding the browse indexes; safe to repeat for existing revisions. */
export const backfillBrowseKeys = internalMutation({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({ isDone: v.boolean(), continueCursor: v.string() }),
  handler: async (ctx, { paginationOpts }) => {
    const result = await ctx.db
      .query("catalogueMeals")
      .paginate(paginationOpts);
    for (const meal of result.page)
      await ctx.db.patch(meal._id, catalogueBrowseKeys(meal));
    if (!result.isDone) {
      await ctx.scheduler.runAfter(0, internal.catalogue.backfillBrowseKeys, {
        paginationOpts: { numItems: 100, cursor: result.continueCursor },
      });
    }
    return { isDone: result.isDone, continueCursor: result.continueCursor };
  },
});
