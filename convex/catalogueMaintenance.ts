import { ConvexError, v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireAdministrator } from "./lib/auth";
import { getCurrentCatalogueMeals } from "./lib/catalogue";
import { prepareRecipeContent } from "../src/lib/domain/recipes";
import {
  recipeFingerprint,
  type EditorialTags,
} from "../src/lib/domain/catalogue-generation";
import { enqueue } from "./catalogueAdmin";

const unknownTags: EditorialTags = {
  cuisines: [],
  mealOccasion: "unknown",
  cookingMethods: [],
  proteinSource: "",
  carbBase: "",
  flavourProfile: [],
  complexity: "unknown",
  vegetarian: "unknown",
  vegan: "unknown",
};

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireAdministrator(ctx);
    const meals = (await getCurrentCatalogueMeals(ctx)).map((meal) => ({
      _id: meal._id,
      title: meal.title,
      version: meal.version,
      proteinCategory: meal.proteinCategory,
    }));
    const activeRun = await ctx.db
      .query("catalogueGenerationRuns")
      .withIndex("by_active", (q) => q.eq("active", true))
      .unique();
    return { meals, activeRun };
  },
});
export const getMeal = query({
  args: { mealId: v.id("catalogueMeals") },
  handler: async (ctx, { mealId }) => {
    await requireAdministrator(ctx);
    const meal = await ctx.db.get(mealId);
    if (!meal || meal.status !== "published") return null;
    return {
      mealId: meal._id,
      version: meal.version,
      content: prepareRecipeContent(meal),
      imageUrl: meal.imageStorageId
        ? await ctx.storage.getUrl(meal.imageStorageId)
        : null,
    };
  },
});

export const start = mutation({
  args: {
    mealId: v.id("catalogueMeals"),
    mode: v.union(v.literal("recipe"), v.literal("image")),
    feedback: v.optional(v.string()),
    requestKey: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireAdministrator(ctx);
    if (
      !args.requestKey.trim() ||
      args.requestKey.length > 160 ||
      (args.feedback?.length ?? 0) > 2000
    )
      throw new ConvexError(
        "Provide a valid request and at most 2,000 characters of guidance.",
      );
    const replay = await ctx.db
      .query("catalogueGenerationRuns")
      .withIndex("by_request", (q) =>
        q.eq("actor", actor).eq("requestKey", args.requestKey),
      )
      .unique();
    if (replay) {
      if (!replay.proposalId)
        throw new ConvexError("This request key belongs to another task.");
      const proposal = await ctx.db.get(replay.proposalId);
      if (proposal?.sourceMealId !== args.mealId)
        throw new ConvexError("This request key belongs to another recipe.");
      return { proposalId: replay.proposalId, runId: replay._id, reused: true };
    }
    const meal = await ctx.db.get(args.mealId);
    if (!meal || meal.status !== "published")
      throw new ConvexError(
        "The catalogue recipe changed. Reload before continuing.",
      );
    for (const status of [
      "pending_review",
      "generating_image",
      "image_review",
    ] as const) {
      const existing = await ctx.db
        .query("catalogueProposals")
        .withIndex("by_source_and_status", (q) =>
          q.eq("sourceMealId", meal._id).eq("status", status),
        )
        .first();
      if (existing)
        return { proposalId: existing._id, runId: null, reused: true };
    }
    const active = await ctx.db
      .query("catalogueGenerationRuns")
      .withIndex("by_active", (q) => q.eq("active", true))
      .unique();
    if (active)
      throw new ConvexError(
        "Another editorial task is running. Try again when it finishes.",
      );
    const content = prepareRecipeContent(meal);
    const fingerprint = await recipeFingerprint(content);
    const metadata = await ctx.db
      .query("catalogueAnalysisMetadata")
      .withIndex("by_meal_revision", (q) =>
        q
          .eq("catalogueMealId", meal.catalogueMealId)
          .eq("catalogueVersion", meal.version),
      )
      .unique();
    const now = Date.now();
    const proposalId = await ctx.db.insert("catalogueProposals", {
      content,
      tags:
        metadata?.status === "reviewed" && metadata.fingerprint === fingerprint
          ? metadata.tags
          : unknownTags,
      sourceMealId: meal._id,
      maintenanceMode: args.mode,
      initialPrompt: args.feedback?.trim() || undefined,
      concept: meal.title,
      rationale:
        args.mode === "image"
          ? "Replace the photograph while preserving the published recipe text."
          : "Review and improve the existing catalogue recipe.",
      status: "pending_review",
      revision: 1,
      reviewedRevision: args.mode === "image" ? 1 : undefined,
      findings: [],
      fingerprint,
      createdBy: actor,
      createdAt: now,
      updatedAt: now,
    });
    const runId = await enqueue(ctx, {
      operation: args.mode === "image" ? "image" : "improve",
      requestKey: args.requestKey,
      actor,
      trigger: "manual",
      proposalId,
      expectedRevision: 1,
      feedback: args.feedback?.trim() || undefined,
    });
    return { proposalId, runId, reused: false };
  },
});
