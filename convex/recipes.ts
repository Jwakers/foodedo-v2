import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { ConvexError, v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { requireAuthSubject } from "./lib/auth";
import {
  recipeContentValidator,
  recipeViewValidator,
} from "./lib/recipeValidators";
import {
  prepareRecipeContent,
  RecipeValidationError,
} from "../src/lib/domain/recipes";
import { findStandardCatalogueMeal } from "../src/lib/domain/standard-catalogue";

const maximumPageSize = 50;

export const create = mutation({
  args: { recipe: recipeContentValidator },
  returns: v.id("recipes"),
  handler: async (ctx, { recipe }) => {
    const ownerSubject = await requireAuthSubject(ctx);
    const content = prepareRecipeOrThrow(recipe);

    return await ctx.db.insert("recipes", {
      ownerSubject,
      ...content,
      source: { type: "manual" },
      updatedAt: Date.now(),
    });
  },
});

export const saveCatalogueMeal = mutation({
  args: {
    catalogueMealId: v.string(),
    catalogueVersion: v.number(),
  },
  returns: v.object({
    recipeId: v.id("recipes"),
    created: v.boolean(),
  }),
  handler: async (ctx, { catalogueMealId, catalogueVersion }) => {
    const ownerSubject = await requireAuthSubject(ctx);
    const catalogueMeal = findStandardCatalogueMeal(
      catalogueMealId,
      catalogueVersion,
    );

    if (catalogueMeal === null) {
      throw new ConvexError({
        code: "CATALOGUE_MEAL_NOT_FOUND",
        message: "This catalogue meal is unavailable or out of date.",
      });
    }

    const existing = await ctx.db
      .query("recipes")
      .withIndex("by_owner_and_catalogue_source", (q) =>
        q
          .eq("ownerSubject", ownerSubject)
          .eq("source.catalogueMealId", catalogueMealId)
          .eq("source.catalogueVersion", catalogueVersion),
      )
      .unique();

    if (existing !== null) {
      return { recipeId: existing._id, created: false };
    }

    const content = prepareRecipeOrThrow(catalogueMeal);
    const recipeId = await ctx.db.insert("recipes", {
      ownerSubject,
      ...content,
      source: {
        type: "catalogue",
        catalogueMealId,
        catalogueVersion,
      },
      updatedAt: Date.now(),
    });

    return { recipeId, created: true };
  },
});

export const getMine = query({
  args: { recipeId: v.id("recipes") },
  returns: v.union(recipeViewValidator, v.null()),
  handler: async (ctx, { recipeId }) => {
    const ownerSubject = await requireAuthSubject(ctx);
    const recipe = await ctx.db.get(recipeId);

    if (recipe === null || recipe.ownerSubject !== ownerSubject) return null;
    return toRecipeView(recipe);
  },
});

export const listMine = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(recipeViewValidator),
  handler: async (ctx, { paginationOpts }) => {
    const ownerSubject = await requireAuthSubject(ctx);
    const boundedPaginationOpts = {
      ...paginationOpts,
      numItems: Math.min(Math.max(paginationOpts.numItems, 1), maximumPageSize),
    };
    const result = await ctx.db
      .query("recipes")
      .withIndex("by_owner_and_updated_at", (q) =>
        q.eq("ownerSubject", ownerSubject),
      )
      .order("desc")
      .paginate(boundedPaginationOpts);

    return {
      ...result,
      page: result.page.map(toRecipeView),
    };
  },
});

function prepareRecipeOrThrow(
  recipe: Parameters<typeof prepareRecipeContent>[0],
) {
  try {
    return prepareRecipeContent(recipe);
  } catch (error) {
    if (error instanceof RecipeValidationError) {
      throw new ConvexError({
        code: "INVALID_RECIPE",
        message: error.message,
      });
    }
    throw error;
  }
}

function toRecipeView(recipe: Doc<"recipes">) {
  return {
    _id: recipe._id,
    _creationTime: recipe._creationTime,
    title: recipe.title,
    ...(recipe.description === undefined
      ? {}
      : { description: recipe.description }),
    ingredients: recipe.ingredients,
    steps: recipe.steps,
    ...(recipe.servings === undefined ? {} : { servings: recipe.servings }),
    ...(recipe.prepMinutes === undefined
      ? {}
      : { prepMinutes: recipe.prepMinutes }),
    ...(recipe.cookMinutes === undefined
      ? {}
      : { cookMinutes: recipe.cookMinutes }),
    source: recipe.source,
    updatedAt: recipe.updatedAt,
  };
}
