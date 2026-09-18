import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { ConvexError, v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { requireUserId } from "./lib/auth";
import {
  proteinCategoryValidator,
  recipeIngredientInputValidator,
  recipeContentFields,
  recipeViewValidator,
} from "./lib/recipeValidators";
import {
  prepareRecipeContent,
  RECIPE_LIMITS,
  RecipeValidationError,
} from "../src/lib/domain/recipes";
import { getOrCreateCatalogueRecipe } from "./lib/catalogueRecipes";
import { getCatalogueMeal } from "./lib/catalogue";

const maximumPageSize = 50;

export const create = mutation({
  args: {
    recipe: v.object({
      ...recipeContentFields,
      ingredients: v.array(recipeIngredientInputValidator),
      proteinCategory: proteinCategoryValidator,
    }),
  },
  returns: v.id("recipes"),
  handler: async (ctx, { recipe }) => {
    const ownerId = await requireUserId(ctx);
    const content = prepareRecipeOrThrow(recipe);
    const savedAt = Date.now();

    return await ctx.db.insert("recipes", {
      ownerId,
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
    const ownerId = await requireUserId(ctx);
    if (
      (await getCatalogueMeal(ctx, catalogueMealId, catalogueVersion)) === null
    ) {
      return { status: "catalogue_unsupported" } as const;
    }

    const savedRecipe = await getOrCreateCatalogueRecipe(ctx, {
      ownerId,
      catalogueMealId,
      catalogueVersion,
      saveToLibrary: true,
    });
    return { status: "saved", ...savedRecipe } as const;
  },
});

export const getMine = query({
  args: { recipeId: v.id("recipes") },
  returns: v.union(recipeViewValidator, v.null()),
  handler: async (ctx, { recipeId }) => {
    const ownerId = await requireUserId(ctx);
    const recipe = await ctx.db.get(recipeId);

    if (recipe === null || recipe.ownerId !== ownerId) return null;
    return await toRecipeView(ctx, recipe);
  },
});

export const removeMineFromLibrary = mutation({
  args: { recipeId: v.id("recipes") },
  returns: v.union(
    v.object({ status: v.literal("removed") }),
    v.object({ status: v.literal("not_found") }),
  ),
  handler: async (ctx, { recipeId }) => {
    const ownerId = await requireUserId(ctx);
    const recipe = await ctx.db.get(recipeId);
    if (
      recipe === null ||
      recipe.ownerId !== ownerId ||
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
      .withIndex("by_owner_and_updated_at", (q) => q.eq("ownerId", ownerId))
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

export const listSavedCatalogueMeals = query({
  args: {},
  returns: v.array(
    v.object({
      catalogueMealId: v.string(),
      recipeId: v.id("recipes"),
    }),
  ),
  handler: async (ctx) => {
    const ownerId = await requireUserId(ctx);
    const recipes = await ctx.db
      .query("recipes")
      .withIndex("by_owner_and_saved_at", (q) =>
        q.eq("ownerId", ownerId).gt("savedAt", 0),
      )
      .take(RECIPE_LIMITS.catalogueMeals + 1);

    if (recipes.length > RECIPE_LIMITS.catalogueMeals) {
      throw new Error(
        "Saved catalogue state exceeds the supported catalogue size.",
      );
    }

    const seen = new Set<string>();
    return recipes.flatMap((recipe) => {
      if (recipe.source.type !== "catalogue") return [];
      if (seen.has(recipe.source.catalogueMealId)) return [];
      seen.add(recipe.source.catalogueMealId);
      return [
        {
          catalogueMealId: recipe.source.catalogueMealId,
          recipeId: recipe._id,
        },
      ];
    });
  },
});

export const listMine = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(recipeViewValidator),
  handler: async (ctx, { paginationOpts }) => {
    const ownerId = await requireUserId(ctx);
    const boundedPaginationOpts = {
      ...paginationOpts,
      numItems: Math.min(Math.max(paginationOpts.numItems, 1), maximumPageSize),
    };
    const result = await ctx.db
      .query("recipes")
      .withIndex("by_owner_and_saved_at", (q) =>
        q.eq("ownerId", ownerId).gt("savedAt", 0),
      )
      .order("desc")
      .paginate(boundedPaginationOpts);

    return {
      ...result,
      page: await Promise.all(
        result.page.map((recipe) => toRecipeView(ctx, recipe)),
      ),
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

async function toRecipeView(ctx: QueryCtx, recipe: Doc<"recipes">) {
  const imageSrc =
    recipe.imageStorageId === undefined
      ? undefined
      : ((await ctx.storage.getUrl(recipe.imageStorageId)) ?? undefined);
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
    proteinCategory: recipe.proteinCategory ?? "meat-free",
    ...(recipe.costBand === undefined ? {} : { costBand: recipe.costBand }),
    ...(recipe.preheat === undefined ? {} : { preheat: recipe.preheat }),
    ...(imageSrc === undefined ? {} : { imageSrc }),
    source: recipe.source,
    ...(recipe.savedAt === undefined ? {} : { savedAt: recipe.savedAt }),
    updatedAt: recipe.updatedAt,
  };
}
