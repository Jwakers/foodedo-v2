import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  recipeContentFields,
  recipeSourceValidator,
} from "./lib/recipeValidators";

export default defineSchema({
  users: defineTable({
    authSubject: v.string(),
    email: v.union(v.string(), v.null()),
    name: v.union(v.string(), v.null()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_auth_subject", ["authSubject"]),
  recipes: defineTable({
    ownerSubject: v.string(),
    ...recipeContentFields,
    source: recipeSourceValidator,
    updatedAt: v.number(),
  })
    .index("by_owner_and_updated_at", ["ownerSubject", "updatedAt"])
    .index("by_owner_and_catalogue_source", [
      "ownerSubject",
      "source.catalogueMealId",
      "source.catalogueVersion",
    ])
    .index("by_owner_and_catalogue_version", [
      "ownerSubject",
      "source.catalogueVersion",
      "source.catalogueMealId",
    ]),
  mealPlans: defineTable({
    ownerSubject: v.string(),
    startDate: v.string(),
    endDate: v.string(),
    status: v.union(v.literal("active"), v.literal("archived")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner_and_updated_at", ["ownerSubject", "updatedAt"])
    .index("by_owner_and_status_and_updated_at", [
      "ownerSubject",
      "status",
      "updatedAt",
    ]),
  mealSlots: defineTable({
    mealPlanId: v.id("mealPlans"),
    ownerSubject: v.string(),
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
    .index("by_owner_and_date", ["ownerSubject", "date"])
    .index("by_recipe", ["recipeId"]),
  guestClaims: defineTable({
    ownerSubject: v.string(),
    claimKey: v.string(),
    mealPlanId: v.id("mealPlans"),
    claimedAt: v.number(),
  }).index("by_owner_and_claim_key", ["ownerSubject", "claimKey"]),
});
