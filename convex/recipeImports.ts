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
import { getCurrentUser, requireUserId } from "./lib/auth";
import {
  RECIPE_IMPORT_FAILURE_REASONS,
  RECIPE_NORMALIZATION_VERSION,
} from "./lib/recipeImport/contracts";
import {
  recipeContentValidator,
  recipeMetadataProvenanceValidator,
  recipeNormalizationWarningValidator,
  recipeReviewIssueValidator,
  importDraftValidator,
  importDraftIssueValidator,
  recipeImportFailureCodeValidator as failureCodeValidator,
  recipeImportFailureDetailValidator as failureDetailValidator,
} from "./lib/recipeValidators";
import {
  getRecipeReviewIssues,
  prepareRecipeContent,
  prepareRecipeDraft,
  type RecipeReviewIssue,
  RecipeValidationError,
} from "../src/lib/domain/recipes";
import { RECIPE_IMPORT_INPUT_LIMITS } from "../src/lib/domain/recipe-import";
import {
  normalizeDraftIssues,
  type ImportDraftIssue,
} from "../src/lib/domain/recipe-import-draft";

const IMPORT_TIMEOUT_MS = 120_000;
const IMPORT_RETENTION_MS = 7 * 24 * 60 * 60 * 1_000;

const sourceValidator = v.union(
  v.object({ type: v.literal("url"), url: v.string() }),
  v.object({ type: v.literal("text"), text: v.string() }),
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
  v.literal("awaiting_input"),
  v.literal("failed"),
);

const importViewValidator = v.object({
  _id: v.id("recipeImports"),
  sourceType: v.union(v.literal("url"), v.literal("text")),
  sourceUrl: v.optional(v.string()),
  status: importStatusValidator,
  phase: phaseValidator,
  attempt: v.number(),
  draft: v.optional(importDraftValidator),
  expiresAt: v.optional(v.number()),
  failureCode: v.optional(failureCodeValidator),
  failureDetails: v.optional(v.array(failureDetailValidator)),
  failureSourceIds: v.optional(v.array(v.string())),
  failureReasons: v.optional(v.array(v.string())),
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

/** Small owner-private subscription for app-wide in-app completion feedback. */
export const notificationJobs = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("recipeImports"),
      attempt: v.number(),
      status: importStatusValidator,
      updatedAt: v.number(),
      resultRecipeId: v.optional(v.id("recipes")),
    }),
  ),
  handler: async (ctx) => {
    // This observer mounts across the app: an account awaiting its Clerk
    // webhook must not throw and take unrelated screens down.
    const user = await getCurrentUser(ctx);
    if (!user) return [];
    const ownerId = user._id;
    const jobs = await ctx.db
      .query("recipeImports")
      .withIndex("by_owner_and_updated_at", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .take(20);
    return jobs.map(({ _id, attempt, status, updatedAt, resultRecipeId }) => ({
      _id,
      attempt,
      status,
      updatedAt,
      ...(resultRecipeId ? { resultRecipeId } : {}),
    }));
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
    if (job.draft && (!job.expiresAt || job.expiresAt <= Date.now()))
      throw new ConvexError({
        code: "DRAFT_EXPIRED",
        message: "This draft expired. Paste the recipe again.",
      });
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
      failureDetails: undefined,
      failureSourceIds: undefined,
      failureReasons: undefined,
      updatedAt: Date.now(),
    });
    await scheduleAttempt(ctx, importId, attempt);
    return attempt;
  },
});

export const stageDraft = internalMutation({
  args: {
    importId: v.id("recipeImports"),
    attempt: v.number(),
    recipe: recipeContentValidator,
    issues: v.array(importDraftIssueValidator),
    metadataProvenance: recipeMetadataProvenanceValidator,
    sourceName: v.optional(v.string()),
    sourceAuthor: v.optional(v.string()),
    sourceImageUrls: v.optional(v.array(v.string())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.importId);
    if (!job || job.attempt !== args.attempt || job.status !== "processing")
      return null;
    const recipe = prepareRecipeDraft(args.recipe);
    const issues = boundedDraftIssues(args.issues);
    const now = Date.now();
    const expiresAt = job.expiresAt ?? now + IMPORT_RETENTION_MS;
    await ctx.db.patch(job._id, {
      status: "awaiting_input",
      phase: "complete",
      inputText: undefined,
      expiresAt,
      ...(args.sourceName ? { sourceName: args.sourceName.slice(0, 160) } : {}),
      ...(args.sourceAuthor
        ? { sourceAuthor: args.sourceAuthor.slice(0, 160) }
        : {}),
      ...(args.sourceImageUrls
        ? { sourceImageUrls: args.sourceImageUrls.slice(0, 3) }
        : {}),
      draft: {
        recipe,
        issues,
        resolvedIssueIndexes: [],
        revision: 1,
        metadataProvenance: args.metadataProvenance,
        ...(args.sourceName
          ? { sourceName: args.sourceName.slice(0, 160) }
          : {}),
        ...(args.sourceAuthor
          ? { sourceAuthor: args.sourceAuthor.slice(0, 160) }
          : {}),
        ...(args.sourceImageUrls
          ? { sourceImageUrls: args.sourceImageUrls.slice(0, 3) }
          : {}),
      },
      updatedAt: now,
      failureCode: undefined,
      failureDetails: undefined,
      failureSourceIds: undefined,
      failureReasons: undefined,
    });
    await ctx.scheduler.runAfter(
      Math.max(0, expiresAt - now),
      internal.recipeImports.cleanupImport,
      { importId: job._id, expectedUpdatedAt: now },
    );
    return null;
  },
});

export const updateDraft = mutation({
  args: {
    importId: v.id("recipeImports"),
    attempt: v.number(),
    revision: v.number(),
    recipe: recipeContentValidator,
    resolvedIssueIndexes: v.array(v.number()),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const job = await ownedDraft(ctx, args);
    const recipe = prepareRecipeDraft(args.recipe);
    if (
      args.resolvedIssueIndexes.some(
        (index) =>
          !Number.isInteger(index) ||
          index < 0 ||
          index >= job.draft!.issues.length,
      )
    )
      throwInvalid("Invalid issue resolution.");
    const revision = job.draft!.revision + 1;
    // Corrections are user-authored; do not retain AI provenance for edited metadata.
    const metadataProvenance = { ...job.draft!.metadataProvenance };
    for (const field of [
      "servings",
      "minimumServings",
      "prepMinutes",
      "cookMinutes",
    ] as const) {
      if (recipe[field] !== job.draft!.recipe[field])
        delete metadataProvenance[field];
    }
    await ctx.db.patch(job._id, {
      draft: {
        ...job.draft!,
        recipe,
        metadataProvenance,
        revision,
        resolvedIssueIndexes: [...new Set(args.resolvedIssueIndexes)],
      },
      updatedAt: Date.now(),
    });
    return revision;
  },
});

export const finalizeDraft = mutation({
  args: {
    importId: v.id("recipeImports"),
    attempt: v.number(),
    revision: v.number(),
  },
  returns: v.id("recipes"),
  handler: async (ctx, args) => {
    const ownerId = await requireUserId(ctx);
    const existing = await ctx.db.get(args.importId);
    if (
      existing?.ownerId === ownerId &&
      existing.attempt === args.attempt &&
      existing.resultRecipeId
    )
      return existing.resultRecipeId;
    const job = await ownedDraft(ctx, args);
    const draft = job.draft!;
    if (
      draft.issues.some(
        (issue, index) =>
          issue.blocking && !draft.resolvedIssueIndexes.includes(index),
      )
    )
      throwInvalid("Resolve the highlighted recipe issues before saving.");
    const recipe = prepareRecipeContent({
      ...draft.recipe,
      servingScaling: "source_only",
    });
    const now = Date.now();
    // A revision token identifies exactly this finalized content for asynchronous image work.
    const contentFingerprint = `draft:${job._id}:${draft.revision}`;
    const source = {
      type: "import" as const,
      method: job.sourceType,
      importedAt: now,
      normalizationVersion: RECIPE_NORMALIZATION_VERSION,
      contentFingerprint,
      ...(job.sourceUrl ? { sourceUrl: job.sourceUrl } : {}),
      ...(draft.sourceName ? { sourceName: draft.sourceName } : {}),
      ...(draft.sourceAuthor ? { sourceAuthor: draft.sourceAuthor } : {}),
      ...(draft.metadataProvenance
        ? { metadataProvenance: draft.metadataProvenance }
        : {}),
    };
    const recipeId = await ctx.db.insert("recipes", {
      ownerId,
      ...recipe,
      source,
      savedAt: now,
      contentEditedAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(job._id, {
      resultRecipeId: recipeId,
      status: getRecipeReviewIssues({ ...recipe, source }).length
        ? "needs_review"
        : "succeeded",
      draft: undefined,
      inputText: undefined,
      expiresAt: undefined,
      failureCode: undefined,
      failureDetails: undefined,
      failureSourceIds: undefined,
      failureReasons: undefined,
      updatedAt: now,
    });
    if (draft.sourceImageUrls?.length)
      await ctx.scheduler.runAfter(
        0,
        internal.recipeImportActions.copySourceImage,
        {
          recipeId,
          imageUrls: draft.sourceImageUrls,
          expectedContentFingerprint: contentFingerprint,
        },
      );
    await ctx.scheduler.runAfter(
      IMPORT_RETENTION_MS,
      internal.recipeImports.cleanupImport,
      { importId: job._id, expectedUpdatedAt: now },
    );
    return recipeId;
  },
});

export const resumeDraft = mutation({
  args: {
    importId: v.id("recipeImports"),
    attempt: v.number(),
    revision: v.number(),
    text: v.string(),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const job = await ownedDraft(ctx, args);
    if (!args.text.trim()) throwInvalid("Paste the missing recipe content.");
    const text = args.text.trim();
    if (text.length > RECIPE_IMPORT_INPUT_LIMITS.textCharacters)
      throwInvalid("That recipe text is too long.");
    const attempt = job.attempt + 1;
    await ctx.db.patch(job._id, {
      inputText: text,
      attempt,
      status: "queued",
      phase: "waiting",
      // Retain the last editable snapshot and its fixed expiry until replacement succeeds.
      failureCode: undefined,
      failureDetails: undefined,
      failureSourceIds: undefined,
      failureReasons: undefined,
      updatedAt: Date.now(),
    });
    await scheduleAttempt(ctx, job._id, attempt);
    return attempt;
  },
});

async function ownedDraft(
  ctx: MutationCtx,
  args: { importId: Id<"recipeImports">; attempt: number; revision: number },
) {
  const ownerId = await requireUserId(ctx);
  const job = await ctx.db.get(args.importId);
  if (!job || job.ownerId !== ownerId)
    throw new ConvexError({ code: "NOT_FOUND", message: "Import not found." });
  if (
    (job.status !== "awaiting_input" && job.status !== "failed") ||
    !job.draft ||
    job.attempt !== args.attempt ||
    job.draft.revision !== args.revision
  )
    throw new ConvexError({
      code: "STALE_DRAFT",
      message: "This draft changed. Reload before saving.",
    });
  if (!job.expiresAt || job.expiresAt <= Date.now())
    throw new ConvexError({
      code: "DRAFT_EXPIRED",
      message: "This draft expired. Paste the recipe again.",
    });
  return job;
}

function boundedDraftIssues(issues: ImportDraftIssue[]) {
  if (
    issues.length > 30 ||
    issues.some(
      (issue) =>
        !issue.message.trim() ||
        issue.message.length > 400 ||
        (issue.targetId?.length ?? 0) > 80,
    )
  )
    throwInvalid("Invalid draft issues.");
  return normalizeDraftIssues(issues);
}

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
      method: v.union(v.literal("url"), v.literal("text")),
      sourceName: v.optional(v.string()),
      sourceAuthor: v.optional(v.string()),
      sourceImageUrls: v.optional(v.array(v.string())),
      recoveredDraft: v.optional(importDraftValidator),
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
      sourceType: job.inputText ? ("text" as const) : job.sourceType,
      method: job.sourceType,
      ...(job.sourceName ? { sourceName: job.sourceName } : {}),
      ...(job.sourceAuthor ? { sourceAuthor: job.sourceAuthor } : {}),
      ...(job.sourceImageUrls ? { sourceImageUrls: job.sourceImageUrls } : {}),
      ...(job.draft ? { recoveredDraft: job.draft } : {}),
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
      failureDetails: undefined,
      failureSourceIds: undefined,
      failureReasons: undefined,
      resultRecipeId: recipeId,
      draft: undefined,
      expiresAt: undefined,
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
    failureDetails: v.optional(v.array(failureDetailValidator)),
    failureSourceIds: v.optional(v.array(v.string())),
    failureReasons: v.optional(v.array(v.string())),
  },
  returns: v.null(),
  handler: async (
    ctx,
    {
      importId,
      attempt,
      failureCode,
      failureDetails,
      failureSourceIds,
      failureReasons,
    },
  ) => {
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
        ...(failureDetails === undefined ? {} : { failureDetails }),
        ...(failureReasons === undefined
          ? {}
          : {
              failureReasons: failureReasons
                .filter((reason) =>
                  (RECIPE_IMPORT_FAILURE_REASONS as readonly string[]).includes(
                    reason,
                  ),
                )
                .slice(0, 9),
            }),
        ...(failureSourceIds === undefined
          ? {}
          : {
              failureSourceIds: failureSourceIds
                .filter((id) => /^B\d{1,7}$/.test(id))
                .slice(0, 24),
            }),
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
      job?.draft &&
      job.expiresAt !== undefined &&
      job.expiresAt <= Date.now()
    ) {
      await ctx.db.delete(importId);
      return null;
    }
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
    ...(job.failureDetails === undefined
      ? {}
      : { failureDetails: job.failureDetails }),
    ...(job.failureSourceIds === undefined
      ? {}
      : { failureSourceIds: job.failureSourceIds }),
    ...(job.failureReasons === undefined
      ? {}
      : { failureReasons: job.failureReasons }),
    ...(job.resultRecipeId === undefined
      ? {}
      : { resultRecipeId: job.resultRecipeId }),
    reviewIssues,
    ...(job.draft ? { draft: job.draft } : {}),
    ...(job.expiresAt === undefined ? {} : { expiresAt: job.expiresAt }),
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}
