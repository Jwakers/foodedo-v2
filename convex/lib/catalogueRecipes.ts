import {
  prepareRecipeContent,
  RecipeValidationError,
} from "../../src/lib/domain/recipes";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { getCatalogueMeal } from "./catalogue";

export async function getOrCreateCatalogueRecipe(
  ctx: MutationCtx,
  {
    ownerId,
    catalogueMealId,
    catalogueVersion,
    saveToLibrary,
  }: {
    ownerId: Id<"users">;
    catalogueMealId: string;
    catalogueVersion: number;
    saveToLibrary: boolean;
  },
) {
  const catalogueMeal = await getCatalogueMeal(
    ctx,
    catalogueMealId,
    catalogueVersion,
  );

  if (catalogueMeal === null) {
    throw new Error("A published catalogue meal could not be resolved.");
  }

  if (saveToLibrary) {
    const savedForIdentity = await ctx.db
      .query("recipes")
      .withIndex("by_owner_and_catalogue_source", (q) =>
        q.eq("ownerId", ownerId).eq("source.catalogueMealId", catalogueMealId),
      )
      .collect();
    const saved = savedForIdentity.find(
      (recipe) =>
        recipe.source.type === "catalogue" && recipe.savedAt !== undefined,
    );
    if (saved !== undefined) {
      return { recipeId: saved._id, created: false } as const;
    }
  }

  const existing = await ctx.db
    .query("recipes")
    .withIndex("by_owner_and_catalogue_source", (q) =>
      q
        .eq("ownerId", ownerId)
        .eq("source.catalogueMealId", catalogueMealId)
        .eq("source.catalogueVersion", catalogueVersion),
    )
    .unique();

  if (existing !== null) {
    if (saveToLibrary && existing.savedAt === undefined) {
      const savedAt = Date.now();
      await ctx.db.patch(existing._id, { savedAt, updatedAt: savedAt });
    }
    return { recipeId: existing._id, created: false } as const;
  }

  let content;
  try {
    content = prepareRecipeContent({
      title: catalogueMeal.title,
      ...(catalogueMeal.description === undefined
        ? {}
        : { description: catalogueMeal.description }),
      ingredients: catalogueMeal.ingredients,
      steps: catalogueMeal.steps,
      ...(catalogueMeal.servings === undefined
        ? {}
        : { servings: catalogueMeal.servings }),
      ...(catalogueMeal.prepMinutes === undefined
        ? {}
        : { prepMinutes: catalogueMeal.prepMinutes }),
      ...(catalogueMeal.cookMinutes === undefined
        ? {}
        : { cookMinutes: catalogueMeal.cookMinutes }),
      proteinCategory: catalogueMeal.proteinCategory,
      ...(catalogueMeal.costBand === undefined
        ? {}
        : { costBand: catalogueMeal.costBand }),
      ...(catalogueMeal.preheat === undefined
        ? {}
        : { preheat: catalogueMeal.preheat }),
    });
  } catch (error) {
    if (error instanceof RecipeValidationError) {
      throw new Error("The built-in catalogue contains an invalid recipe.", {
        cause: error,
      });
    }
    throw error;
  }

  const createdAt = Date.now();
  const recipeId = await ctx.db.insert("recipes", {
    ownerId,
    ...content,
    ...(catalogueMeal.imageStorageId === undefined
      ? {}
      : { imageStorageId: catalogueMeal.imageStorageId }),
    source: {
      type: "catalogue",
      catalogueMealId,
      catalogueVersion,
    },
    ...(saveToLibrary ? { savedAt: createdAt } : {}),
    updatedAt: createdAt,
  });

  return { recipeId, created: true } as const;
}
