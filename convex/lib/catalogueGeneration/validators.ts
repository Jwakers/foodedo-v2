import { v } from "convex/values";
export const tagsValidator = v.object({
  cuisines: v.array(v.string()),
  mealOccasion: v.union(
    v.literal("lunch"),
    v.literal("dinner"),
    v.literal("unknown"),
  ),
  cookingMethods: v.array(v.string()),
  proteinSource: v.string(),
  carbBase: v.string(),
  flavourProfile: v.array(v.string()),
  complexity: v.union(
    v.literal("simple"),
    v.literal("moderate"),
    v.literal("complex"),
    v.literal("unknown"),
  ),
  vegetarian: v.union(v.literal("yes"), v.literal("no"), v.literal("unknown")),
  vegan: v.union(v.literal("yes"), v.literal("no"), v.literal("unknown")),
});
export const findingValidator = v.object({
  area: v.string(),
  message: v.string(),
  blocking: v.boolean(),
});
export const operationValidator = v.union(
  v.literal("generate"),
  v.literal("regenerate"),
  v.literal("improve"),
  v.literal("review"),
  v.literal("image"),
  v.literal("enrich"),
);
export const telemetryValidator = v.object({
  role: v.string(),
  requestedModel: v.string(),
  resolvedModel: v.string(),
  durationMs: v.number(),
  inputTokens: v.optional(v.number()),
  outputTokens: v.optional(v.number()),
  costUsd: v.optional(v.number()),
  outcome: v.string(),
});
