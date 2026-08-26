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
    ]),
});
