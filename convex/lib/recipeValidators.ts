import { v } from "convex/values";

export const shoppingCategoryValidator = v.union(
  v.literal("fruit_and_veg"),
  v.literal("meat_and_fish"),
  v.literal("dairy_and_eggs"),
  v.literal("pantry"),
  v.literal("bakery"),
  v.literal("other"),
);

export const recipeIngredientValidator = v.object({
  id: v.string(),
  name: v.string(),
  shoppingCategory: shoppingCategoryValidator,
  quantity: v.optional(v.string()),
  unit: v.optional(v.string()),
  note: v.optional(v.string()),
});

export const recipeIngredientInputValidator = v.object({
  id: v.string(),
  name: v.string(),
  shoppingCategory: shoppingCategoryValidator,
  quantity: v.optional(v.string()),
  unit: v.optional(v.string()),
  note: v.optional(v.string()),
});

export const recipeStepValidator = v.object({
  id: v.string(),
  text: v.string(),
  timerCues: v.optional(
    v.array(
      v.object({
        id: v.string(),
        label: v.string(),
        durationSeconds: v.number(),
      }),
    ),
  ),
});

export const recipePreheatValidator = v.object({
  appliance: v.literal("oven"),
  temperatureC: v.number(),
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
  proteinCategory: proteinCategoryValidator,
  costBand: v.optional(costBandValidator),
  preheat: v.optional(recipePreheatValidator),
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
  imageSrc: v.optional(v.string()),
  source: recipeSourceValidator,
  savedAt: v.optional(v.number()),
  updatedAt: v.number(),
});

export const catalogueMealStatusValidator = v.union(
  v.literal("staging"),
  v.literal("published"),
  v.literal("retired"),
);

export const catalogueMealSummaryValidator = v.object({
  id: v.string(),
  version: v.number(),
  slug: v.string(),
  position: v.number(),
  title: v.string(),
  description: v.optional(v.string()),
  servings: v.optional(v.number()),
  prepMinutes: v.optional(v.number()),
  cookMinutes: v.optional(v.number()),
  proteinCategory: proteinCategoryValidator,
  costBand: v.optional(costBandValidator),
  imageSrc: v.optional(v.string()),
});

export const catalogueMealViewValidator = v.object({
  id: v.string(),
  version: v.number(),
  slug: v.string(),
  position: v.number(),
  ...recipeContentFields,
  imageSrc: v.optional(v.string()),
});

export const catalogueViewValidator = v.object({
  meals: v.array(catalogueMealSummaryValidator),
});
