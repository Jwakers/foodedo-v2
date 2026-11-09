import { v } from "convex/values";
import schema from "../../schema";
import { recipeContentValidator } from "../recipeValidators";
import { tagsValidator } from "./validators";

const counts = v.array(v.object({ value: v.string(), count: v.number() }));
export const statisticsValidator = v.object({
  total: v.number(),
  classified: v.number(),
  protein: counts,
  cost: counts,
  prepTime: counts,
  cookTime: counts,
  totalTime: counts,
  ingredients: counts,
  ingredientCounts: v.array(v.number()),
  cuisines: counts,
  mealOccasion: counts,
  methods: counts,
  proteinSources: counts,
  carbBases: counts,
  flavourProfiles: counts,
  complexity: counts,
  vegetarian: counts,
  vegan: counts,
});
export const nearestValidator = v.array(
  v.object({
    key: v.string(),
    title: v.string(),
    exact: v.boolean(),
    overlap: v.number(),
    similarity: v.number(),
  }),
);
export const analysisMealValidator = v.object({
  key: v.string(),
  content: v.union(recipeContentValidator, schema.doc("catalogueMeals")),
  tags: v.optional(tagsValidator),
  isCatalogueRevision: v.optional(v.boolean()),
});
export const editorialPayloadValidator = v.union(
  v.null(),
  v.object({
    run: schema.doc("catalogueGenerationRuns"),
    proposal: v.union(schema.doc("catalogueProposals"), v.null()),
    meals: v.array(analysisMealValidator),
    enrichment: v.array(
      v.object({
        catalogueMealId: v.string(),
        version: v.number(),
        content: v.union(recipeContentValidator, schema.doc("catalogueMeals")),
        fingerprint: v.string(),
      }),
    ),
  }),
);
export const proposalViewValidator = v.union(
  v.null(),
  schema.doc("catalogueProposals").extend({
    sourceMeal: v.union(schema.doc("catalogueMeals"), v.null()),
    photoGuidance: v.string(),
    sourceImageUrl: v.union(v.string(), v.null()),
    latestRun: v.union(schema.doc("catalogueGenerationRuns"), v.null()),
    nearest: nearestValidator,
    imageUrl: v.union(v.string(), v.null()),
  }),
);
export const overviewValidator = v.object({
  proposals: v.array(
    v.object({
      _id: v.id("catalogueProposals"),
      title: v.string(),
      status: schema.doc("catalogueProposals").fields.status,
      revision: v.number(),
      updatedAt: v.number(),
    }),
  ),
  runs: v.array(schema.doc("catalogueGenerationRuns")),
  activeRun: v.union(schema.doc("catalogueGenerationRuns"), v.null()),
  statistics: statisticsValidator,
});
