import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { ConvexError, v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { requireAuthSubject } from "./lib/auth";
import {
  proteinCategoryValidator,
  recipeContentFields,
  recipeViewValidator,
} from "./lib/recipeValidators";
import {
  prepareRecipeContent,
  RECIPE_LIMITS,
  RecipeValidationError,
} from "../src/lib/domain/recipes";
import { findStandardCatalogueMeal } from "../src/lib/domain/standard-catalogue";
import { getOrCreateCatalogueRecipe } from "./lib/catalogueRecipes";

const maximumPageSize = 50;

export const create = mutation({
  args: {
    recipe: v.object({
      ...recipeContentFields,
      proteinCategory: proteinCategoryValidator,
    }),
  },
  returns: v.id("recipes"),
  handler: async (ctx, { recipe }) => {
    const ownerSubject = await requireAuthSubject(ctx);
    const content = prepareRecipeOrThrow(recipe);
    const savedAt = Date.now();

    return await ctx.db.insert("recipes", {
      ownerSubject,
      ...content,
      source: { type: "manual" },
      savedAt,
      updatedAt: savedAt,
    });
  },
});

export const saveCatalogueMeal = mutation({
  args: {
    catalogueMealId: v.string(),
    catalogueVersion: v.number(),
  },
  returns: v.union(
    v.object({
      status: v.literal("saved"),
      recipeId: v.id("recipes"),
      created: v.boolean(),
    }),
    v.object({ status: v.literal("catalogue_unsupported") }),
  ),
  handler: async (ctx, { catalogueMealId, catalogueVersion }) => {
    const ownerSubject = await requireAuthSubject(ctx);
    if (findStandardCatalogueMeal(catalogueMealId, catalogueVersion) === null) {
      return { status: "catalogue_unsupported" } as const;
    }

    const savedRecipe = await getOrCreateCatalogueRecipe(ctx, {
      ownerSubject,
      catalogueMealId,
      catalogueVersion,
      saveToLibrary: true,
    });
    return { status: "saved", ...savedRecipe } as const;
  },
});

export const getMine = query({
  args: { recipeId: v.string() },
  returns: v.union(recipeViewValidator, v.null()),
  handler: async (ctx, { recipeId }) => {
    const ownerSubject = await requireAuthSubject(ctx);
    const normalisedRecipeId = ctx.db.normalizeId("recipes", recipeId);
    if (normalisedRecipeId === null) return null;

    const recipe = await ctx.db.get(normalisedRecipeId);

    if (recipe === null || recipe.ownerSubject !== ownerSubject) return null;
    return toRecipeView(recipe);
  },
});

export const removeMineFromLibrary = mutation({
  args: { recipeId: v.string() },
  returns: v.union(
    v.object({ status: v.literal("removed") }),
    v.object({ status: v.literal("not_found") }),
  ),
  handler: async (ctx, { recipeId }) => {
    const ownerSubject = await requireAuthSubject(ctx);
    const normalisedRecipeId = ctx.db.normalizeId("recipes", recipeId);
    if (normalisedRecipeId === null) return { status: "not_found" } as const;

    const recipe = await ctx.db.get(normalisedRecipeId);
    if (
      recipe === null ||
      recipe.ownerSubject !== ownerSubject ||
      recipe.savedAt === undefined
    ) {
      return { status: "not_found" } as const;
    }

    const referencedSlot = await ctx.db
      .query("mealSlots")
      .withIndex("by_recipe", (q) => q.eq("recipeId", recipe._id))
      .first();

    const shoppingListItems = await ctx.db
      .query("shoppingListItems")
      .withIndex("by_owner_and_updated_at", (q) =>
        q.eq("ownerSubject", ownerSubject),
      )
      .collect();
    const referencedInShoppingList = shoppingListItems.some((item) =>
      item.sourceRecipeIds.includes(recipe._id),
    );

    if (referencedSlot === null && !referencedInShoppingList) {
      await ctx.db.delete(recipe._id);
    } else {
      await ctx.db.patch(recipe._id, {
        savedAt: undefined,
        updatedAt: Date.now(),
      });
    }

    return { status: "removed" } as const;
  },
});

export const listSavedCatalogueMealIds = query({
  args: { catalogueVersion: v.number() },
  returns: v.array(v.string()),
  handler: async (ctx, { catalogueVersion }) => {
    const ownerSubject = await requireAuthSubject(ctx);

    if (!Number.isInteger(catalogueVersion) || catalogueVersion < 1) {
      throw new ConvexError({
        code: "INVALID_CATALOGUE_VERSION",
        message: "Catalogue version must be a positive whole number.",
      });
    }

    const recipes = await ctx.db
      .query("recipes")
      .withIndex("by_owner_and_catalogue_version", (q) =>
        q
          .eq("ownerSubject", ownerSubject)
          .eq("source.catalogueVersion", catalogueVersion),
      )
      .take(RECIPE_LIMITS.catalogueMeals + 1);

    if (recipes.length > RECIPE_LIMITS.catalogueMeals) {
      throw new Error(
        "Saved catalogue state exceeds the supported catalogue size.",
      );
    }

    return recipes.flatMap((recipe) =>
      recipe.savedAt !== undefined && recipe.source.type === "catalogue"
        ? [recipe.source.catalogueMealId]
        : [],
    );
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
      .withIndex("by_owner_and_saved_at", (q) =>
        q.eq("ownerSubject", ownerSubject).gt("savedAt", 0),
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
    ...(recipe.proteinCategory === undefined
      ? {}
      : { proteinCategory: recipe.proteinCategory }),
    ...(recipe.costBand === undefined ? {} : { costBand: recipe.costBand }),
    ...(recipe.imageSrc === undefined ? {} : { imageSrc: recipe.imageSrc }),
    source: recipe.source,
    ...(recipe.savedAt === undefined ? {} : { savedAt: recipe.savedAt }),
    updatedAt: recipe.updatedAt,
  };
}
