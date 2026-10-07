import { v } from "convex/values";
import {
  RECIPE_IMPORT_FAILURE_CODES,
  RECIPE_IMPORT_FAILURE_DETAILS,
} from "./recipeImport/contracts";

export const recipeImportFailureCodeValidator = v.union(
  ...RECIPE_IMPORT_FAILURE_CODES.map((code) => v.literal(code)),
);
export const recipeImportFailureDetailValidator = v.union(
  ...RECIPE_IMPORT_FAILURE_DETAILS.map((detail) => v.literal(detail)),
);

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
  sourceText: v.optional(v.string()),
  amountText: v.optional(v.string()),
  group: v.optional(v.string()),
  noteRefs: v.optional(v.array(v.string())),
});

export const recipeIngredientInputValidator = v.object({
  id: v.string(),
  name: v.string(),
  shoppingCategory: shoppingCategoryValidator,
  quantity: v.optional(v.string()),
  unit: v.optional(v.string()),
  note: v.optional(v.string()),
  sourceText: v.optional(v.string()),
  amountText: v.optional(v.string()),
  group: v.optional(v.string()),
  noteRefs: v.optional(v.array(v.string())),
});

export const recipeStepValidator = v.object({
  id: v.string(),
  text: v.string(),
  group: v.optional(v.string()),
  timerCues: v.optional(
    v.array(
      v.object({
        id: v.string(),
        label: v.string(),
        durationSeconds: v.number(),
      }),
    ),
  ),
  sourceText: v.optional(v.string()),
  noteRefs: v.optional(v.array(v.string())),
});

export const recipeNoteValidator = v.object({
  id: v.string(),
  label: v.optional(v.string()),
  text: v.string(),
  sourceText: v.optional(v.string()),
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
  v.literal("other"),
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
  notes: v.optional(v.array(recipeNoteValidator)),
  servingScaling: v.optional(
    v.union(v.literal("safe"), v.literal("source_only")),
  ),
};

export const recipeContentValidator = v.object(recipeContentFields);

export const recipeMetadataOriginValidator = v.union(
  v.literal("published"),
  v.literal("derived"),
  v.literal("estimated"),
);

export const recipeMetadataProvenanceValidator = v.object({
  servings: v.optional(recipeMetadataOriginValidator),
  prepMinutes: v.optional(recipeMetadataOriginValidator),
  cookMinutes: v.optional(recipeMetadataOriginValidator),
});

export const recipeNormalizationWarningValidator = v.object({
  area: v.union(
    v.literal("ingredients"),
    v.literal("method"),
    v.literal("notes"),
    v.literal("metadata"),
  ),
  code: v.union(
    v.literal("ambiguous"),
    v.literal("unresolved_reference"),
    v.literal("source_conflict"),
    v.literal("partial_coverage"),
  ),
  targetId: v.optional(v.string()),
});

export const recipeSourceValidator = v.union(
  v.object({ type: v.literal("manual") }),
  v.object({
    type: v.literal("catalogue"),
    catalogueMealId: v.string(),
    catalogueVersion: v.number(),
  }),
  v.object({
    type: v.literal("import"),
    method: v.union(v.literal("url"), v.literal("text")),
    importedAt: v.number(),
    sourceUrl: v.optional(v.string()),
    sourceName: v.optional(v.string()),
    sourceAuthor: v.optional(v.string()),
    normalizationVersion: v.optional(v.number()),
    contentFingerprint: v.optional(v.string()),
    metadataProvenance: v.optional(recipeMetadataProvenanceValidator),
    normalizationWarnings: v.optional(
      v.array(recipeNormalizationWarningValidator),
    ),
  }),
);

export const recipeReviewIssueValidator = v.union(
  v.literal("servings"),
  v.literal("prep_minutes"),
  v.literal("cook_minutes"),
);

export const recipeViewValidator = v.object({
  _id: v.id("recipes"),
  _creationTime: v.number(),
  ...recipeContentFields,
  imageSrc: v.optional(v.string()),
  source: recipeSourceValidator,
  reviewIssues: v.array(recipeReviewIssueValidator),
  savedAt: v.optional(v.number()),
  contentEditedAt: v.optional(v.number()),
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
