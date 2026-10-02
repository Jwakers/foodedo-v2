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
  getRecipeReviewIssues,
  prepareRecipeContent,
  RECIPE_LIMITS,
  type RecipeMetadataProvenance,
  type RecipeSource,
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

export const repairImport = mutation({
  args: {
    recipeId: v.id("recipes"),
    servings: v.optional(v.number()),
    prepMinutes: v.optional(v.number()),
    cookMinutes: v.optional(v.number()),
  },
  returns: v.union(recipeViewValidator, v.null()),
  handler: async (ctx, args) => {
    const ownerId = await requireUserId(ctx);
    const recipe = await ctx.db.get(args.recipeId);
    if (
      recipe === null ||
      recipe.ownerId !== ownerId ||
      recipe.source.type !== "import"
    ) {
      return null;
    }

    const content = prepareRecipeOrThrow({
      ...recipe,
      ...(args.servings === undefined ? {} : { servings: args.servings }),
      ...(args.prepMinutes === undefined
        ? {}
        : { prepMinutes: args.prepMinutes }),
      ...(args.cookMinutes === undefined
        ? {}
        : { cookMinutes: args.cookMinutes }),
    });
    const now = Date.now();
    const source = removeEditedMetadataProvenance(recipe.source, [
      ...(args.servings === undefined ? [] : ["servings" as const]),
      ...(args.prepMinutes === undefined ? [] : ["prepMinutes" as const]),
      ...(args.cookMinutes === undefined ? [] : ["cookMinutes" as const]),
    ]);
    await ctx.db.patch(recipe._id, {
      ...content,
      source,
      contentEditedAt: now,
      updatedAt: now,
    });
    const updated = await ctx.db.get(recipe._id);
    return updated === null ? null : await toRecipeView(ctx, updated);
  },
});

export const updateImported = mutation({
  args: {
    recipeId: v.id("recipes"),
    recipe: v.object({
      ...recipeContentFields,
      ingredients: v.array(recipeIngredientInputValidator),
      proteinCategory: proteinCategoryValidator,
    }),
  },
  returns: v.union(recipeViewValidator, v.null()),
  handler: async (ctx, { recipeId, recipe: input }) => {
    const ownerId = await requireUserId(ctx);
    const recipe = await ctx.db.get(recipeId);
    if (
      recipe === null ||
      recipe.ownerId !== ownerId ||
      recipe.source.type !== "import"
    ) {
      return null;
    }
    const content = prepareRecipeOrThrow(input);
    const now = Date.now();
    const source = clearNormalizationWarnings(
      removeEditedMetadataProvenance(recipe.source, [
        ...(recipe.servings === content.servings ? [] : ["servings" as const]),
        ...(recipe.prepMinutes === content.prepMinutes
          ? []
          : ["prepMinutes" as const]),
        ...(recipe.cookMinutes === content.cookMinutes
          ? []
          : ["cookMinutes" as const]),
      ]),
    );
    await ctx.db.patch(recipeId, {
      description: undefined,
      servings: undefined,
      prepMinutes: undefined,
      cookMinutes: undefined,
      costBand: undefined,
      preheat: undefined,
      notes: undefined,
      servingScaling: undefined,
      ...content,
      source,
      contentEditedAt: now,
      updatedAt: now,
    });
    const updated = await ctx.db.get(recipeId);
    return updated === null ? null : await toRecipeView(ctx, updated);
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
  const view = {
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
    ...(recipe.notes === undefined ? {} : { notes: recipe.notes }),
    servingScaling:
      recipe.servingScaling ??
      (recipe.source.type === "import" ? "source_only" : "safe"),
    ...(imageSrc === undefined ? {} : { imageSrc }),
    source: recipe.source,
    ...(recipe.savedAt === undefined ? {} : { savedAt: recipe.savedAt }),
    ...(recipe.contentEditedAt === undefined
      ? {}
      : { contentEditedAt: recipe.contentEditedAt }),
    updatedAt: recipe.updatedAt,
  };
  return {
    ...view,
    reviewIssues: getRecipeReviewIssues(view),
  };
}

function removeEditedMetadataProvenance(
  source: RecipeSource,
  fields: Array<keyof RecipeMetadataProvenance>,
): RecipeSource {
  if (
    source.type !== "import" ||
    source.metadataProvenance === undefined ||
    fields.length === 0
  ) {
    return source;
  }
  const metadataProvenance = { ...source.metadataProvenance };
  for (const field of fields) delete metadataProvenance[field];
  const base = { ...source };
  delete base.metadataProvenance;
  return Object.keys(metadataProvenance).length > 0
    ? { ...base, metadataProvenance }
    : base;
}

function clearNormalizationWarnings(source: RecipeSource): RecipeSource {
  if (source.type !== "import" || source.normalizationWarnings === undefined) {
    return source;
  }
  const next = { ...source };
  delete next.normalizationWarnings;
  return next;
}
