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

export const proteinCategoryValidator = v.union(
  v.literal("chicken"),
  v.literal("beef"),
  v.literal("pork"),
  v.literal("lamb"),
  v.literal("fish"),
  v.literal("meat-free"),
);

export const costBandValidator = v.union(
  v.literal("budget"),
  v.literal("standard"),
  v.literal("premium"),
);

export const recipeContentFields = {
  title: v.string(),
  description: v.optional(v.string()),
  ingredients: v.array(recipeIngredientValidator),
  steps: v.array(recipeStepValidator),
  servings: v.optional(v.number()),
  prepMinutes: v.optional(v.number()),
  cookMinutes: v.optional(v.number()),
  // Optional in Convex until existing private snapshots are backfilled; domain
  // prepareRecipeContent still requires proteinCategory for new writes.
  proteinCategory: v.optional(proteinCategoryValidator),
  costBand: v.optional(costBandValidator),
  imageSrc: v.optional(v.string()),
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
  savedAt: v.optional(v.number()),
  updatedAt: v.number(),
});
