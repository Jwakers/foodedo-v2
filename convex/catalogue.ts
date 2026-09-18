import { v } from "convex/values";
import { query } from "./_generated/server";
import {
  catalogueMealSummaryValidator,
  catalogueMealViewValidator,
  catalogueViewValidator,
} from "./lib/recipeValidators";
import {
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
