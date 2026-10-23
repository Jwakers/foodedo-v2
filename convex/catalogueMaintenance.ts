import { ConvexError, v } from "convex/values";
import {
  query,
  mutation,
  internalQuery,
  internalMutation,
} from "./_generated/server";
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

/** Operator-only, full-content export for a reviewed minimum-servings backfill. */
export const exportServingMinimums = internalQuery({
  args: {},
  handler: async (ctx) => {
    const meals = await getCurrentCatalogueMeals(ctx);
    return await Promise.all(
      meals.map(async (meal) => ({
        catalogueMealId: meal.catalogueMealId,
        version: meal.version,
        title: meal.title,
        fingerprint: await recipeFingerprint(prepareRecipeContent(meal)),
        content: prepareRecipeContent(meal),
      })),
    );
  },
});

/** Publishes only reviewed serving metadata, reusing the exact existing image. */
export const applyServingMinimums = internalMutation({
  args: {
    reviewedBy: v.string(),
    rows: v.array(
      v.object({
        catalogueMealId: v.string(),
        version: v.number(),
        fingerprint: v.string(),
        minimumServings: v.union(v.number(), v.null()),
        reason: v.string(),
      }),
    ),
  },
  handler: async (ctx, { reviewedBy, rows }) => {
    if (
      !reviewedBy.trim() ||
      reviewedBy.length > 160 ||
      rows.length < 1 ||
      rows.length > 25 ||
      new Set(rows.map((row) => row.catalogueMealId)).size !== rows.length
    ) {
      throw new ConvexError(
        "Provide a reviewer and 1–25 distinct reviewed meals.",
      );
    }
    const results = [];
    for (const row of rows) {
      if (!row.reason.trim() || row.reason.length > 1000)
        throw new ConvexError("Provide a culinary reason for every change.");
      const source = await ctx.db
        .query("catalogueMeals")
        .withIndex("by_meal_id_and_version", (q) =>
          q
            .eq("catalogueMealId", row.catalogueMealId)
            .eq("version", row.version),
        )
        .unique();
      if (
        !source ||
        (await recipeFingerprint(prepareRecipeContent(source))) !==
          row.fingerprint
      ) {
        throw new ConvexError(
          "The reviewed source recipe changed. Export and review it again.",
        );
      }
      const content = prepareRecipeContent({
        ...source,
        minimumServings: row.minimumServings ?? undefined,
      });
      const fingerprint = await recipeFingerprint(content);
      const current = await ctx.db
        .query("catalogueMeals")
        .withIndex("by_meal_id_and_status", (q) =>
          q
            .eq("catalogueMealId", row.catalogueMealId)
            .eq("status", "published"),
        )
        .unique();
      if (!current)
        throw new ConvexError("The reviewed meal is no longer published.");
      // Replays are harmless, but any intervening content/image change requires review.
      if (current._id !== source._id) {
        if (
          source.status === "retired" &&
          current.imageStorageId === source.imageStorageId &&
          current.slug === source.slug &&
          current.position === source.position &&
          (await recipeFingerprint(prepareRecipeContent(current))) ===
            fingerprint
        ) {
          results.push({
            catalogueMealId: row.catalogueMealId,
            version: current.version,
            status: "unchanged" as const,
          });
          continue;
        }
        throw new ConvexError(
          "A newer recipe revision exists. Export and review it again.",
        );
      }
      if (source.minimumServings === content.minimumServings) {
        results.push({
          catalogueMealId: row.catalogueMealId,
          version: current.version,
          status: "unchanged" as const,
        });
        continue;
      }
      if (!source.imageStorageId)
        throw new ConvexError("The published recipe image is missing.");
      const latest = await ctx.db
        .query("catalogueMeals")
        .withIndex("by_meal_id_and_version", (q) =>
          q.eq("catalogueMealId", row.catalogueMealId),
        )
        .order("desc")
        .first();
      const version = (latest?.version ?? source.version) + 1;
      const now = Date.now();
      await ctx.db.patch(source._id, { status: "retired" });
      await ctx.db.insert("catalogueMeals", {
        ...content,
        catalogueMealId: source.catalogueMealId,
        version,
        status: "published",
        slug: source.slug,
        position: source.position,
        imageStorageId: source.imageStorageId,
        createdAt: now,
        publishedAt: now,
      });
      const metadata = await ctx.db
        .query("catalogueAnalysisMetadata")
        .withIndex("by_meal_revision", (q) =>
          q
            .eq("catalogueMealId", source.catalogueMealId)
            .eq("catalogueVersion", source.version),
        )
        .unique();
      if (metadata)
        await ctx.db.insert("catalogueAnalysisMetadata", {
          catalogueMealId: source.catalogueMealId,
          catalogueVersion: version,
          fingerprint,
          tags: metadata.tags,
          status: metadata.status,
          reviewedBy: metadata.status === "reviewed" ? reviewedBy : undefined,
          reviewedAt: metadata.status === "reviewed" ? now : undefined,
          createdAt: now,
        });
      results.push({
        catalogueMealId: row.catalogueMealId,
        version,
        status: "published" as const,
      });
    }
    return results;
  },
});
