import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  catalogueMealStatusValidator,
  recipeContentFields,
  recipeSourceValidator,
  shoppingCategoryValidator,
  recipeImportFailureCodeValidator,
  recipeImportFailureDetailValidator,
  importDraftValidator,
} from "./lib/recipeValidators";

import {
  tagsValidator,
  findingValidator,
  operationValidator,
  telemetryValidator,
} from "./lib/catalogueGeneration/validators";

import { onboardingValidator } from "./lib/onboarding";

const spaceOwner = v.union(v.id("users"), v.id("households"));

export default defineSchema({
  households: defineTable({
    creatorId: v.id("users"),
    createdAt: v.number(),
    closedAt: v.optional(v.number()),
  }),
  householdMembers: defineTable({
    householdId: v.id("households"),
    userId: v.id("users"),
    joinedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_household", ["householdId"]),
  householdInvites: defineTable({
    householdId: v.id("households"),
    inviterId: v.id("users"),
    token: v.string(),
    createdAt: v.number(),
    expiresAt: v.number(),
    cancelledAt: v.optional(v.number()),
    acceptedBy: v.optional(v.id("users")),
  })
    .index("by_token", ["token"])
    .index("by_household", ["householdId"]),
  catalogueProposals: defineTable({
    content: v.object(recipeContentFields),
    tags: tagsValidator,
    rationale: v.string(),
    concept: v.string(),
    initialPrompt: v.optional(v.string()),
    sourceMealId: v.optional(v.id("catalogueMeals")),
    maintenanceMode: v.optional(
      v.union(v.literal("recipe"), v.literal("image")),
    ),
    changeSummary: v.optional(v.array(v.string())),
    status: v.union(
      v.literal("pending_review"),
      v.literal("generating_image"),
      v.literal("image_review"),
      v.literal("published"),
      v.literal("rejected"),
      v.literal("superseded"),
    ),
    revision: v.number(),
    fingerprint: v.string(),
    findings: v.array(findingValidator),
    reviewedRevision: v.optional(v.number()),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    approvedRevision: v.optional(v.number()),
    approvedBy: v.optional(v.string()),
    approvedAt: v.optional(v.number()),
    imageStorageId: v.optional(v.id("_storage")),
    imageFingerprint: v.optional(v.string()),
    publishedMealId: v.optional(v.id("catalogueMeals")),
    publishedBy: v.optional(v.string()),
    replacesProposalId: v.optional(v.id("catalogueProposals")),
    rejectionReason: v.optional(v.string()),
  })
    .index("by_status", ["status"])
    .index("by_created_at", ["createdAt"])
    .index("by_source_and_status", ["sourceMealId", "status"]),
  catalogueGenerationRuns: defineTable({
    operation: operationValidator,
    trigger: v.union(v.literal("manual"), v.literal("scheduled")),
    requestKey: v.string(),
    actor: v.string(),
    proposalId: v.optional(v.id("catalogueProposals")),
    expectedRevision: v.optional(v.number()),
    feedback: v.optional(v.string()),
    initialPrompt: v.optional(v.string()),
    status: v.union(
      v.literal("queued"),
      v.literal("processing"),
      v.literal("succeeded"),
      v.literal("failed"),
      v.literal("timed_out"),
    ),
    phase: v.string(),
    active: v.boolean(),
    attemptToken: v.string(),
    deadline: v.number(),
    checkpointStage: v.optional(
      v.union(v.literal("original_review"), v.literal("authored")),
    ),
    config: v.object({
      version: v.string(),
      promptVersion: v.string(),
      imageStyleVersion: v.string(),
      textModel: v.string(),
      imageModel: v.string(),
      imageSize: v.optional(v.string()),
      imageQuality: v.optional(
        v.union(
          v.literal("auto"),
          v.literal("low"),
          v.literal("medium"),
          v.literal("high"),
          v.literal("xhigh"),
          v.literal("max"),
        ),
      ),
      reasoningEffort: v.literal("medium"),
      selectionReasoningEffort: v.optional(
        v.union(v.literal("low"), v.literal("medium")),
      ),
      deadlineMs: v.number(),
      textCallTimeoutMs: v.optional(v.number()),
      reviewCallTimeoutMs: v.optional(v.number()),
      maxTextCalls: v.number(),
      maxOutputTokens: v.number(),
      enrichmentBatchSize: v.number(),
      catalogueLimit: v.number(),
      imageBytes: v.number(),
    }),
    usage: v.array(telemetryValidator),
    failure: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_request", ["actor", "requestKey"])
    .index("by_proposal_and_created_at", ["proposalId", "createdAt"])
    .index("by_active", ["active"])
    .index("by_created_at", ["createdAt"]),
  catalogueAnalysisMetadata: defineTable({
    catalogueMealId: v.string(),
    catalogueVersion: v.number(),
    fingerprint: v.string(),
    tags: tagsValidator,
    status: v.union(v.literal("proposed"), v.literal("reviewed")),
    reviewedBy: v.optional(v.string()),
    reviewedAt: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_meal_revision", ["catalogueMealId", "catalogueVersion"]),
  users: defineTable({
    onboarding: v.optional(onboardingValidator),
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
  catalogueMeals: defineTable({
    catalogueMealId: v.string(),
    version: v.number(),
    status: catalogueMealStatusValidator,
    slug: v.string(),
    position: v.number(),
    browseDuration: v.optional(v.number()),
    browseCostRank: v.optional(v.number()),
    ...recipeContentFields,
    imageStorageId: v.optional(v.id("_storage")),
    createdAt: v.number(),
    publishedAt: v.optional(v.number()),
  })
    .index("by_status_and_position", ["status", "position"])
    .index("by_status_and_duration", ["status", "browseDuration", "position"])
    .index("by_status_and_cost", ["status", "browseCostRank", "position"])
    .index("by_meal_id_and_version", ["catalogueMealId", "version"])
    .index("by_meal_id_and_status", ["catalogueMealId", "status"])
    .index("by_status_and_slug", ["status", "slug"]),
  recipes: defineTable({
    ownerId: spaceOwner,
    selectionKey: v.optional(v.string()),
    browseDuration: v.optional(v.number()),
    browseCostRank: v.optional(v.number()),
    ...recipeContentFields,
    imageStorageId: v.optional(v.id("_storage")),
    source: recipeSourceValidator,
    savedAt: v.optional(v.number()),
    contentEditedAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_owner_and_updated_at", ["ownerId", "updatedAt"])
    .index("by_owner_and_saved_at", ["ownerId", "savedAt"])
    .index("by_owner_and_source_and_saved_at", [
      "ownerId",
      "source.type",
      "savedAt",
    ])
    .index("by_owner_and_catalogue_meal_and_saved_at", [
      "ownerId",
      "source.catalogueMealId",
      "savedAt",
    ])
    .index("by_owner_and_duration", ["ownerId", "browseDuration", "savedAt"])
    .index("by_owner_and_cost", ["ownerId", "browseCostRank", "savedAt"])
    .index("by_owner_and_catalogue_source", [
      "ownerId",
      "source.catalogueMealId",
      "source.catalogueVersion",
    ]),
  recipeImports: defineTable({
    ownerId: v.id("users"),
    clientRequestId: v.string(),
    sourceType: v.union(v.literal("url"), v.literal("text")),
    sourceUrl: v.optional(v.string()),
    inputText: v.optional(v.string()),
    sourceName: v.optional(v.string()),
    sourceAuthor: v.optional(v.string()),
    sourceImageUrls: v.optional(v.array(v.string())),
    status: v.union(
      v.literal("queued"),
      v.literal("processing"),
      v.literal("succeeded"),
      v.literal("needs_review"),
      v.literal("awaiting_input"),
      v.literal("failed"),
    ),
    phase: v.union(
      v.literal("waiting"),
      v.literal("fetching"),
      v.literal("organising"),
      v.literal("saving"),
      v.literal("complete"),
    ),
    attempt: v.number(),
    draft: v.optional(importDraftValidator),
    expiresAt: v.optional(v.number()),
    failureCode: v.optional(recipeImportFailureCodeValidator),
    failureDetails: v.optional(v.array(recipeImportFailureDetailValidator)),
    resultRecipeId: v.optional(v.id("recipes")),
    failureSourceIds: v.optional(v.array(v.string())),
    failureReasons: v.optional(v.array(v.string())),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner_and_request", ["ownerId", "clientRequestId"])
    .index("by_owner_and_updated_at", ["ownerId", "updatedAt"]),
  mealPlans: defineTable({
    ownerId: spaceOwner,
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
  mealSelectionFeedback: defineTable({
    ownerId: spaceOwner,
    actorId: v.id("users"),
    mealPlanId: v.id("mealPlans"),
    date: v.string(),
    candidateKey: v.string(),
    outcome: v.union(v.literal("kept"), v.literal("dismissed")),
    updatedAt: v.number(),
  })
    .index("by_plan_date_candidate", ["mealPlanId", "date", "candidateKey"])
    .index("by_owner_and_updated_at", ["ownerId", "updatedAt"])
    .index("by_actor", ["actorId"]),
  mealSlots: defineTable({
    mealPlanId: v.id("mealPlans"),
    ownerId: spaceOwner,
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
    ownerId: spaceOwner,
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
    ownerId: spaceOwner,
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
          requestedServings: v.optional(v.number()),
          date: v.union(v.string(), v.null()),
          amount: v.string(),
        }),
      ),
    ),
    origin: v.union(v.literal("derived"), v.literal("manual")),
    treatment: v.union(v.literal("required"), v.literal("staple")),
    included: v.boolean(),
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
