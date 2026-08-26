import { v } from "convex/values";

export const recipeIngredientValidator = v.object({
  id: v.string(),
  name: v.string(),
  quantity: v.optional(v.string()),
  unit: v.optional(v.string()),
  note: v.optional(v.string()),
});

export const recipeStepValidator = v.object({
  id: v.string(),
  text: v.string(),
});

export const recipeContentFields = {
  title: v.string(),
  description: v.optional(v.string()),
  ingredients: v.array(recipeIngredientValidator),
  steps: v.array(recipeStepValidator),
  servings: v.optional(v.number()),
  prepMinutes: v.optional(v.number()),
  cookMinutes: v.optional(v.number()),
};

export const recipeContentValidator = v.object(recipeContentFields);

export const recipeSourceValidator = v.union(
  v.object({ type: v.literal("manual") }),
  v.object({
    type: v.literal("catalogue"),
    catalogueMealId: v.string(),
    catalogueVersion: v.number(),
  }),
);

export const recipeViewValidator = v.object({
  _id: v.id("recipes"),
  _creationTime: v.number(),
  ...recipeContentFields,
  source: recipeSourceValidator,
  updatedAt: v.number(),
});
