import { ConvexError, v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { requireUserId } from "./lib/auth";
import {
  recipeContentValidator,
  recipeMetadataProvenanceValidator,
  recipeNormalizationWarningValidator,
  recipeReviewIssueValidator,
} from "./lib/recipeValidators";
import {
  getRecipeReviewIssues,
  prepareRecipeContent,
  type RecipeReviewIssue,
  RecipeValidationError,
} from "../src/lib/domain/recipes";
import { RECIPE_IMPORT_INPUT_LIMITS } from "../src/lib/domain/recipe-import";

const IMPORT_TIMEOUT_MS = 120_000;
const IMPORT_RETENTION_MS = 7 * 24 * 60 * 60 * 1_000;

const sourceValidator = v.union(
  v.object({ type: v.literal("url"), url: v.string() }),
  v.object({ type: v.literal("text"), text: v.string() }),
);

const failureCodeValidator = v.union(
  v.literal("invalid_url"),
  v.literal("unsafe_url"),
  v.literal("fetch_failed"),
  v.literal("source_unreachable"),
  v.literal("source_blocked"),
  v.literal("unsupported_content"),
  v.literal("no_recipe"),
  v.literal("incomplete_recipe"),
  v.literal("unsafe_result"),
  v.literal("ai_unavailable"),
  v.literal("invalid_result"),
  v.literal("internal"),
  v.literal("timed_out"),
);

const phaseValidator = v.union(
  v.literal("waiting"),
  v.literal("fetching"),
  v.literal("organising"),
  v.literal("saving"),
  v.literal("complete"),
);

const importStatusValidator = v.union(
  v.literal("queued"),
  v.literal("processing"),
  v.literal("succeeded"),
  v.literal("needs_review"),
  v.literal("failed"),
);

const importViewValidator = v.object({
  _id: v.id("recipeImports"),
  sourceType: v.union(v.literal("url"), v.literal("text")),
  sourceUrl: v.optional(v.string()),
  status: importStatusValidator,
  phase: phaseValidator,
  attempt: v.number(),
  failureCode: v.optional(failureCodeValidator),
  resultRecipeId: v.optional(v.id("recipes")),
  reviewIssues: v.array(recipeReviewIssueValidator),
  createdAt: v.number(),
  updatedAt: v.number(),
});

export const beginImport = mutation({
  args: { clientRequestId: v.string(), source: sourceValidator },
  returns: v.id("recipeImports"),
  handler: async (ctx, { clientRequestId, source }) => {
    const ownerId = await requireUserId(ctx);
    const requestId = clientRequestId.trim();
    if (
      !requestId ||
      requestId.length > RECIPE_IMPORT_INPUT_LIMITS.requestIdCharacters
    ) {
      throwInvalid("Invalid import request identifier.");
    }

    const existing = await ctx.db
      .query("recipeImports")
      .withIndex("by_owner_and_request", (q) =>
        q.eq("ownerId", ownerId).eq("clientRequestId", requestId),
      )
      .unique();
    if (existing !== null) return existing._id;

    const input = prepareSource(source);
    const now = Date.now();
    const importId = await ctx.db.insert("recipeImports", {
      ownerId,
      clientRequestId: requestId,
      ...input,
      status: "queued",
      phase: "waiting",
      attempt: 1,
      createdAt: now,
      updatedAt: now,
    });
    await scheduleAttempt(ctx, importId, 1);
    return importId;
  },
});

export const getImport = query({
  args: { importId: v.id("recipeImports") },
  returns: v.union(importViewValidator, v.null()),
  handler: async (ctx, { importId }) => {
    const ownerId = await requireUserId(ctx);
    const job = await ctx.db.get(importId);
    if (job === null || job.ownerId !== ownerId) return null;
    return await toImportView(ctx, job);
  },
});

export const retryImport = mutation({
  args: { importId: v.id("recipeImports") },
  returns: v.number(),
  handler: async (ctx, { importId }) => {
    const ownerId = await requireUserId(ctx);
    const job = await ctx.db.get(importId);
    if (job === null || job.ownerId !== ownerId) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Import not found.",
      });
    }
    if (job.status !== "failed") {
      throw new ConvexError({
        code: "IMPORT_NOT_RETRYABLE",
        message: "This import is not waiting to be retried.",
      });
    }
    if (!job.sourceUrl && !job.inputText) {
      throw new ConvexError({
        code: "IMPORT_SOURCE_EXPIRED",
        message: "Paste the recipe again to retry this import.",
      });
    }

    const attempt = job.attempt + 1;
    await ctx.db.patch(importId, {
      status: "queued",
      phase: "waiting",
      attempt,
      failureCode: undefined,
      updatedAt: Date.now(),
    });
    await scheduleAttempt(ctx, importId, attempt);
    return attempt;
  },
});

export const claimAttempt = internalMutation({
  args: { importId: v.id("recipeImports"), attempt: v.number() },
  returns: v.boolean(),
  handler: async (ctx, { importId, attempt }) => {
    const job = await ctx.db.get(importId);
    if (job === null || job.attempt !== attempt || job.status !== "queued") {
      return false;
    }
    await ctx.db.patch(importId, {
      status: "processing",
      phase: job.sourceType === "url" ? "fetching" : "organising",
      updatedAt: Date.now(),
    });
    return true;
  },
});

export const getPayload = internalQuery({
  args: { importId: v.id("recipeImports"), attempt: v.number() },
  returns: v.union(
    v.object({
      sourceType: v.union(v.literal("url"), v.literal("text")),
      sourceUrl: v.optional(v.string()),
      inputText: v.optional(v.string()),
    }),
    v.null(),
  ),
  handler: async (ctx, { importId, attempt }) => {
    const job = await ctx.db.get(importId);
    if (
      job === null ||
      job.attempt !== attempt ||
      job.status !== "processing"
    ) {
      return null;
    }
    return {
      sourceType: job.sourceType,
      ...(job.sourceUrl === undefined ? {} : { sourceUrl: job.sourceUrl }),
      ...(job.inputText === undefined ? {} : { inputText: job.inputText }),
    };
  },
});

export const setPhase = internalMutation({
  args: {
    importId: v.id("recipeImports"),
    attempt: v.number(),
    phase: phaseValidator,
  },
  returns: v.null(),
  handler: async (ctx, { importId, attempt, phase }) => {
    const job = await ctx.db.get(importId);
    if (
      job !== null &&
      job.attempt === attempt &&
      job.status === "processing"
    ) {
      await ctx.db.patch(importId, { phase, updatedAt: Date.now() });
    }
    return null;
  },
});

export const completeImport = internalMutation({
  args: {
    importId: v.id("recipeImports"),
    attempt: v.number(),
    recipe: recipeContentValidator,
    method: v.union(v.literal("url"), v.literal("text")),
    sourceUrl: v.optional(v.string()),
    sourceName: v.optional(v.string()),
    sourceAuthor: v.optional(v.string()),
    sourceImageUrls: v.optional(v.array(v.string())),
    normalizationVersion: v.optional(v.number()),
    contentFingerprint: v.optional(v.string()),
    metadataProvenance: v.optional(recipeMetadataProvenanceValidator),
    normalizationWarnings: v.optional(
      v.array(recipeNormalizationWarningValidator),
    ),
  },
  returns: v.union(v.id("recipes"), v.null()),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.importId);
    if (
      job === null ||
      job.attempt !== args.attempt ||
      job.status !== "processing"
    ) {
      return null;
    }

    let content;
    try {
      content = prepareRecipeContent(args.recipe);
    } catch (error) {
      if (error instanceof RecipeValidationError) {
        throw new ConvexError({
          code: "INVALID_RECIPE",
          message: error.message,
        });
      }
      throw error;
    }
    const now = Date.now();
    const source = {
      type: "import" as const,
      method: args.method,
      importedAt: now,
      ...(args.sourceUrl === undefined ? {} : { sourceUrl: args.sourceUrl }),
      ...(args.sourceName === undefined ? {} : { sourceName: args.sourceName }),
      ...(args.sourceAuthor === undefined
        ? {}
        : { sourceAuthor: args.sourceAuthor }),
      normalizationVersion: args.normalizationVersion ?? 1,
      contentFingerprint: args.contentFingerprint ?? "legacy-test-fixture",
      ...(args.metadataProvenance === undefined
        ? {}
        : { metadataProvenance: args.metadataProvenance }),
      ...(args.normalizationWarnings === undefined
        ? {}
        : { normalizationWarnings: args.normalizationWarnings }),
    };
    const recipeId: Id<"recipes"> = await ctx.db.insert("recipes", {
      ownerId: job.ownerId,
      ...content,
      source,
      savedAt: now,
      updatedAt: now,
    });
    const reviewIssues = getRecipeReviewIssues({ ...content, source });
    await ctx.db.patch(args.importId, {
      status: reviewIssues.length > 0 ? "needs_review" : "succeeded",
      phase: "complete",
      inputText: undefined,
      failureCode: undefined,
      resultRecipeId: recipeId,
      updatedAt: now,
    });

    if (args.sourceImageUrls !== undefined && args.contentFingerprint) {
      await ctx.scheduler.runAfter(
        0,
        internal.recipeImportActions.copySourceImage,
        {
          recipeId,
          imageUrls: args.sourceImageUrls,
          expectedContentFingerprint: args.contentFingerprint,
        },
      );
    }
    await ctx.scheduler.runAfter(
      IMPORT_RETENTION_MS,
      internal.recipeImports.cleanupImport,
      { importId: args.importId, expectedUpdatedAt: now },
    );
    return recipeId;
  },
});

export const failImport = internalMutation({
  args: {
    importId: v.id("recipeImports"),
    attempt: v.number(),
    failureCode: failureCodeValidator,
  },
  returns: v.null(),
  handler: async (ctx, { importId, attempt, failureCode }) => {
    const job = await ctx.db.get(importId);
    if (
      job !== null &&
      job.attempt === attempt &&
      (job.status === "processing" || job.status === "queued")
    ) {
      const now = Date.now();
      await ctx.db.patch(importId, {
        status: "failed",
        phase: "complete",
        failureCode,
        updatedAt: now,
      });
      await ctx.scheduler.runAfter(
        IMPORT_RETENTION_MS,
        internal.recipeImports.cleanupImport,
        { importId, expectedUpdatedAt: now },
      );
    }
    return null;
  },
});

export const markTimedOut = internalMutation({
  args: { importId: v.id("recipeImports"), attempt: v.number() },
  returns: v.null(),
  handler: async (ctx, { importId, attempt }) => {
    const job = await ctx.db.get(importId);
    if (
      job !== null &&
      job.attempt === attempt &&
      (job.status === "queued" || job.status === "processing")
    ) {
      const now = Date.now();
      await ctx.db.patch(importId, {
        status: "failed",
        phase: "complete",
        failureCode: "timed_out",
        updatedAt: now,
      });
      await ctx.scheduler.runAfter(
        IMPORT_RETENTION_MS,
        internal.recipeImports.cleanupImport,
        { importId, expectedUpdatedAt: now },
      );
    }
    return null;
  },
});

export const attachImage = internalMutation({
  args: {
    recipeId: v.id("recipes"),
    imageStorageId: v.id("_storage"),
    expectedContentFingerprint: v.string(),
  },
  returns: v.boolean(),
  handler: async (
    ctx,
    { recipeId, imageStorageId, expectedContentFingerprint },
  ) => {
    const recipe = await ctx.db.get(recipeId);
    if (
      recipe === null ||
      recipe.source.type !== "import" ||
      recipe.source.contentFingerprint !== expectedContentFingerprint
    ) {
      return false;
    }
    if (recipe.imageStorageId !== undefined) {
      return false;
    }
    await ctx.db.patch(recipeId, { imageStorageId, updatedAt: Date.now() });
    return true;
  },
});

export const cleanupImport = internalMutation({
  args: {
    importId: v.id("recipeImports"),
    expectedUpdatedAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, { importId, expectedUpdatedAt }) => {
    const job = await ctx.db.get(importId);
    if (
      job !== null &&
      job.updatedAt === expectedUpdatedAt &&
      (job.status === "succeeded" ||
        job.status === "needs_review" ||
        job.status === "failed")
    ) {
      await ctx.db.delete(importId);
    }
    return null;
  },
});

function prepareSource(
  source: { type: "url"; url: string } | { type: "text"; text: string },
) {
  if (source.type === "url") {
    const url = source.url.trim();
    if (!url || url.length > RECIPE_IMPORT_INPUT_LIMITS.urlCharacters) {
      throwInvalid("Enter a shorter recipe link.");
    }
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        throw new Error("Unsupported protocol");
      }
    } catch {
      throwInvalid("Enter a valid recipe link.");
    }
    return { sourceType: "url" as const, sourceUrl: url };
  }

  const text = source.text.trim();
  if (text.length < RECIPE_IMPORT_INPUT_LIMITS.minimumTextCharacters) {
    throwInvalid("Paste a little more of the recipe.");
  }
  if (text.length > RECIPE_IMPORT_INPUT_LIMITS.textCharacters) {
    throwInvalid("That recipe is too long to import.");
  }
  return { sourceType: "text" as const, inputText: text };
}

function throwInvalid(message: string): never {
  throw new ConvexError({ code: "INVALID_IMPORT", message });
}

async function scheduleAttempt(
  ctx: MutationCtx,
  importId: Id<"recipeImports">,
  attempt: number,
) {
  await ctx.scheduler.runAfter(0, internal.recipeImportActions.processImport, {
    importId,
    attempt,
  });
  await ctx.scheduler.runAfter(
    IMPORT_TIMEOUT_MS,
    internal.recipeImports.markTimedOut,
    { importId, attempt },
  );
}

async function toImportView(ctx: QueryCtx, job: Doc<"recipeImports">) {
  let reviewIssues: RecipeReviewIssue[] = [];
  if (job.resultRecipeId !== undefined) {
    const recipe = await ctx.db.get(job.resultRecipeId);
    if (recipe !== null) reviewIssues = getRecipeReviewIssues(recipe);
  }
  return {
    _id: job._id,
    sourceType: job.sourceType,
    ...(job.sourceUrl === undefined ? {} : { sourceUrl: job.sourceUrl }),
    status: job.status,
    phase: job.phase,
    attempt: job.attempt,
    ...(job.failureCode === undefined ? {} : { failureCode: job.failureCode }),
    ...(job.resultRecipeId === undefined
      ? {}
      : { resultRecipeId: job.resultRecipeId }),
    reviewIssues,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}
