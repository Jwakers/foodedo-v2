"use client";

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useFoodedoAuth } from "@/features/auth/use-foodedo-auth";
import type {
  CatalogueMeal,
  RecipeReviewIssue,
  RecipeSource,
} from "@/lib/domain/recipes";

export type PersonalRecipeMeal = CatalogueMeal & {
  reviewIssues: RecipeReviewIssue[];
  source: RecipeSource;
  contentEditedAt?: number;
};

type PersonalRecipeQueryResult = NonNullable<
  FunctionReturnType<typeof api.recipes.getMine>
>;

export function usePersonalRecipe(recipeId: string | null) {
  const { isAuthenticated } = useFoodedoAuth();
  const recipe = useQuery(
    api.recipes.getMine,
    isAuthenticated && recipeId
      ? { recipeId: recipeId as Id<"recipes"> }
      : "skip",
  );
  if (recipe === undefined || recipe === null) return recipe;
  return toPersonalRecipeMeal(recipe);
}

export function toPersonalRecipeMeal(
  recipe: PersonalRecipeQueryResult,
): PersonalRecipeMeal {
  return {
    id: recipe._id,
    version: 1,
    slug: `personal-${recipe._id}`,
    position: 0,
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
    proteinCategory: recipe.proteinCategory,
    ...(recipe.costBand === undefined ? {} : { costBand: recipe.costBand }),
    ...(recipe.preheat === undefined ? {} : { preheat: recipe.preheat }),
    ...(recipe.notes === undefined ? {} : { notes: recipe.notes }),
    ...(recipe.servingScaling === undefined
      ? {}
      : { servingScaling: recipe.servingScaling }),
    ...(recipe.imageSrc === undefined ? {} : { imageSrc: recipe.imageSrc }),
    reviewIssues: recipe.reviewIssues,
    source: recipe.source,
    ...(recipe.contentEditedAt === undefined
      ? {}
      : { contentEditedAt: recipe.contentEditedAt }),
  } satisfies PersonalRecipeMeal;
}
