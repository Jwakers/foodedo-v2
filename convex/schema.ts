import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  recipeContentFields,
  recipeSourceValidator,
  shoppingCategoryValidator,
} from "./lib/recipeValidators";

export default defineSchema({
  users: defineTable({
    authSubject: v.string(),
    email: v.union(v.string(), v.null()),
    name: v.union(v.string(), v.null()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_auth_subject", ["authSubject"]),
  planningPreferences: defineTable({
    ownerId: v.id("users"),
    usualPlanDays: v.union(
      v.literal(3),
      v.literal(4),
      v.literal(5),
      v.literal(6),
      v.literal(7),
    ),
    usualServings: v.number(),
    prioritiseSavedRecipes: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_owner", ["ownerId"]),
  recipes: defineTable({
    ownerId: v.id("users"),
    ...recipeContentFields,
    source: recipeSourceValidator,
    savedAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_owner_and_updated_at", ["ownerId", "updatedAt"])
    .index("by_owner_and_saved_at", ["ownerId", "savedAt"])
    .index("by_owner_and_catalogue_source", [
      "ownerId",
      "source.catalogueMealId",
      "source.catalogueVersion",
    ])
    .index("by_owner_and_catalogue_version", [
      "ownerId",
      "source.catalogueVersion",
      "source.catalogueMealId",
    ]),
  mealPlans: defineTable({
    ownerId: v.id("users"),
    startDate: v.string(),
    endDate: v.string(),
    // Optional while existing plans are migrated; reads resolve the default.
    servings: v.optional(v.number()),
    status: v.union(v.literal("active"), v.literal("archived")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner_and_updated_at", ["ownerId", "updatedAt"])
    .index("by_owner_and_status_and_updated_at", [
      "ownerId",
      "status",
      "updatedAt",
    ]),
  mealSlots: defineTable({
    mealPlanId: v.id("mealPlans"),
    ownerId: v.id("users"),
    date: v.string(),
    recipeId: v.id("recipes"),
    status: v.union(
      v.literal("planned"),
      v.literal("cooked"),
      v.literal("skipped"),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_plan_and_date", ["mealPlanId", "date"])
    .index("by_owner_and_date", ["ownerId", "date"])
    .index("by_recipe", ["recipeId"]),
  shoppingLists: defineTable({
    ownerId: v.id("users"),
    mealPlanId: v.id("mealPlans"),
    mealPlanUpdatedAt: v.number(),
    status: v.union(v.literal("active"), v.literal("archived")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_updated_at", ["updatedAt"])
    .index("by_owner_and_updated_at", ["ownerId", "updatedAt"])
    .index("by_owner_and_status_and_updated_at", [
      "ownerId",
      "status",
      "updatedAt",
    ])
    .index("by_meal_plan", ["mealPlanId"]),
  shoppingListItems: defineTable({
    shoppingListId: v.id("shoppingLists"),
    ownerId: v.id("users"),
    name: v.string(),
    displayName: v.optional(v.string()),
    category: v.optional(shoppingCategoryValidator),
    detailLines: v.array(v.string()),
    sourceRecipeIds: v.array(v.id("recipes")),
    sources: v.optional(
      v.array(
        v.object({
          recipeId: v.id("recipes"),
          recipeTitle: v.string(),
          date: v.union(v.string(), v.null()),
          amount: v.string(),
        }),
      ),
    ),
    origin: v.union(v.literal("derived"), v.literal("manual")),
    checked: v.boolean(),
    deletedAt: v.optional(v.number()),
    order: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_list_and_order", ["shoppingListId", "order"])
    .index("by_owner_and_updated_at", ["ownerId", "updatedAt"]),
  guestClaims: defineTable({
    ownerId: v.id("users"),
    claimKey: v.string(),
    mealPlanId: v.id("mealPlans"),
    claimedAt: v.number(),
  }).index("by_owner_and_claim_key", ["ownerId", "claimKey"]),
});
