import {
  prepareRecipeContent,
  RecipeValidationError,
} from "../../src/lib/domain/recipes";
import { findStandardCatalogueMeal } from "../../src/lib/domain/standard-catalogue";
import type { MutationCtx } from "../_generated/server";

export async function getOrCreateCatalogueRecipe(
  ctx: MutationCtx,
  {
    ownerSubject,
    catalogueMealId,
    catalogueVersion,
    saveToLibrary,
  }: {
    ownerSubject: string;
    catalogueMealId: string;
    catalogueVersion: number;
    saveToLibrary: boolean;
  },
) {
  const catalogueMeal = findStandardCatalogueMeal(
    catalogueMealId,
    catalogueVersion,
  );

  if (catalogueMeal === null) {
    throw new Error("A validated catalogue meal could not be resolved.");
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
    if (saveToLibrary && existing.savedAt === undefined) {
      const savedAt = Date.now();
      await ctx.db.patch(existing._id, { savedAt, updatedAt: savedAt });
    }
    return { recipeId: existing._id, created: false } as const;
  }

  let content;
  try {
    content = prepareRecipeContent(catalogueMeal);
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
    ownerSubject,
    ...content,
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
