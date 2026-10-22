import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  query,
  mutation,
  internalQuery,
  internalMutation,
  type MutationCtx,
} from "./_generated/server";
import { isAdministrator, requireAdministrator } from "./lib/auth";
import { prepareRecipeContent } from "../src/lib/domain/recipes";
import { recipeContentValidator } from "./lib/recipeValidators";
import {
  findingValidator,
  operationValidator,
  tagsValidator,
  telemetryValidator,
} from "./lib/catalogueGeneration/validators";
import {
  generationConfig,
  improvementLimits,
  scheduledGenerationPolicy,
  catalogueSchedule,
} from "./lib/catalogueGeneration/config";
import {
  currentProposalSource,
  validateProposal,
} from "./lib/catalogueGeneration/revisions";
import { analysisSnapshot } from "./lib/catalogueGeneration/catalogue";
import {
  catalogueStatistics,
  culinaryContentChanged,
  recipeFingerprint,
  validateGeneratedRecipe,
  normaliseRecipeText,
  nearestRecipes,
} from "../src/lib/domain/catalogue-generation";

function fail(message: string): never {
  throw new ConvexError({ code: "INVALID_OPERATION", message });
}
function validateTags(tags: Doc<"catalogueProposals">["tags"]) {
  for (const values of [
    tags.cuisines,
    tags.cookingMethods,
    tags.flavourProfile,
  ]) {
    if (values.length > 8 || values.some((s) => !s.trim() || s.length > 80))
      fail("Use at most eight concise tags per field.");
  }
  if (tags.proteinSource.length > 120 || tags.carbBase.length > 120)
    fail("Analysis labels must be concise.");
  if (tags.vegan === "yes" && tags.vegetarian !== "yes")
    fail("Vegan recipes must also be vegetarian.");
  return tags;
}
async function editable(
  ctx: MutationCtx,
  proposalId: Id<"catalogueProposals">,
  revision: number,
) {
  const p = await ctx.db.get(proposalId);
  if (!p || p.revision !== revision)
    fail("The proposal changed. Reload before continuing.");
  if (!["pending_review", "image_review"].includes(p.status))
    fail("This proposal cannot be edited in its current state.");
  return p;
}
async function removeImage(ctx: MutationCtx, p: Doc<"catalogueProposals">) {
  if (p.imageStorageId && !p.publishedMealId)
    await ctx.storage.delete(p.imageStorageId);
}

export const access = query({
  args: {},
  handler: async (ctx) => ({ isAdmin: await isAdministrator(ctx) }),
});
export const overview = query({
  args: {},
  handler: async (ctx) => {
    await requireAdministrator(ctx);
    const [proposals, runs, meals] = await Promise.all([
      ctx.db
        .query("catalogueProposals")
        .withIndex("by_created_at")
        .order("desc")
        .take(200),
      ctx.db
        .query("catalogueGenerationRuns")
        .withIndex("by_created_at")
        .order("desc")
        .take(20),
      analysisSnapshot(ctx),
    ]);
    const activeRun = await ctx.db
      .query("catalogueGenerationRuns")
      .withIndex("by_active", (q) => q.eq("active", true))
      .unique();
    return {
      proposals: proposals.map((p) => ({
        _id: p._id,
        title: p.content.title,
        status: p.status,
        revision: p.revision,
        updatedAt: p.updatedAt,
      })),
      runs,
      activeRun,
      statistics: catalogueStatistics(meals),
    };
  },
});
export const getProposal = query({
  args: { proposalId: v.id("catalogueProposals") },
  handler: async (ctx, { proposalId }) => {
    await requireAdministrator(ctx);
    const proposal = await ctx.db.get(proposalId);
    const sourceMeal = proposal?.sourceMealId
      ? await ctx.db.get(proposal.sourceMealId)
      : null;
    return proposal
      ? {
          ...proposal,
          sourceMeal,
          sourceImageUrl: sourceMeal?.imageStorageId
            ? await ctx.storage.getUrl(sourceMeal.imageStorageId)
            : null,
          latestRun: await ctx.db
            .query("catalogueGenerationRuns")
            .withIndex("by_proposal_and_created_at", (q) =>
              q.eq("proposalId", proposalId),
            )
            .order("desc")
            .first(),
          nearest: nearestRecipes(
            proposal.content,
            await analysisSnapshot(ctx, proposal._id),
          ),
          imageUrl: proposal.imageStorageId
            ? await ctx.storage.getUrl(proposal.imageStorageId)
            : null,
        }
      : null;
  },
});
export const analysisRows = query({
  args: {},
  handler: async (ctx) => {
    await requireAdministrator(ctx);
    const meals = await ctx.db
      .query("catalogueMeals")
      .withIndex("by_status_and_position", (q) => q.eq("status", "published"))
      .take(1001);
    if (meals.length > 1000) fail("Catalogue analysis limit exceeded.");
    return await Promise.all(
      meals.map(async (meal) => {
        const metadata = await ctx.db
          .query("catalogueAnalysisMetadata")
          .withIndex("by_meal_revision", (q) =>
            q
              .eq("catalogueMealId", meal.catalogueMealId)
              .eq("catalogueVersion", meal.version),
          )
          .unique();
        return {
          title: meal.title,
          catalogueMealId: meal.catalogueMealId,
          version: meal.version,
          metadata,
        };
      }),
    );
  },
});

type EnqueueArgs = {
  operation: Doc<"catalogueGenerationRuns">["operation"];
  requestKey: string;
  actor: string;
  trigger: "manual" | "scheduled";
  proposalId?: Id<"catalogueProposals">;
  expectedRevision?: number;
  feedback?: string;
  initialPrompt?: string;
};
function findRunByRequest(ctx: MutationCtx, actor: string, requestKey: string) {
  return ctx.db
    .query("catalogueGenerationRuns")
    .withIndex("by_request", (q) =>
      q.eq("actor", actor).eq("requestKey", requestKey),
    )
    .unique();
}

export async function enqueue(
  ctx: MutationCtx,
  args: EnqueueArgs,
): Promise<Id<"catalogueGenerationRuns">> {
  if (
    !args.requestKey.trim() ||
    args.requestKey.length > 160 ||
    (args.feedback?.length ?? 0) > 2000
  )
    fail("Invalid generation request.");
  const initialPrompt = args.initialPrompt?.trim() || undefined;
  if ((initialPrompt?.length ?? 0) > 2000)
    fail("Recipe requests must be at most 2,000 characters.");
  if (initialPrompt && args.operation !== "generate")
    fail("An initial recipe request is only supported for new generation.");
  args = { ...args, initialPrompt };
  const existing = await findRunByRequest(ctx, args.actor, args.requestKey);
  if (existing) return existing._id;
  if (
    (args.operation === "generate" || args.operation === "enrich") &&
    (args.proposalId !== undefined || args.expectedRevision !== undefined)
  )
    fail("This operation does not accept a proposal reference.");
  const active = await ctx.db
    .query("catalogueGenerationRuns")
    .withIndex("by_active", (q) => q.eq("active", true))
    .unique();
  if (active) return active._id;
  if (["regenerate", "review", "image", "improve"].includes(args.operation)) {
    if (!args.proposalId || args.expectedRevision === undefined)
      fail("A proposal revision is required.");
    const p = await editable(ctx, args.proposalId, args.expectedRevision);
    await currentProposalSource(ctx, p);
    if (args.operation === "improve" && !p.sourceMealId)
      fail("Choose an existing catalogue recipe to improve.");
    if (args.operation === "image") {
      const validation = await validateProposal(
        ctx,
        p,
        await analysisSnapshot(ctx, p._id),
      );
      if (
        p.reviewedRevision !== p.revision ||
        [...p.findings, ...validation.findings].some((f) => f.blocking)
      )
        fail(
          "Complete a successful culinary review before approving this recipe.",
        );
      await ctx.db.patch(p._id, {
        status: "generating_image",
        approvedRevision: p.revision,
        approvedBy: args.actor,
        approvedAt: Date.now(),
      });
    }
  }
  const config = {
    ...generationConfig,
    ...(args.operation === "improve" ||
    (args.operation === "regenerate" &&
      args.proposalId &&
      (await ctx.db.get(args.proposalId))?.sourceMealId)
      ? { deadlineMs: improvementLimits.deadlineMs }
      : {}),
  };
  const now = Date.now();
  const runId = await ctx.db.insert("catalogueGenerationRuns", {
    ...args,
    status: "queued",
    phase: "waiting",
    active: true,
    attemptToken: `${args.actor}:${args.requestKey}`,
    deadline: now + config.deadlineMs,
    config,
    usage: [],
    createdAt: now,
    updatedAt: now,
  });
  await ctx.scheduler.runAfter(0, internal.catalogueGenerationActions.process, {
    runId,
  });
  await ctx.scheduler.runAfter(
    config.deadlineMs + 1000,
    internal.catalogueAdmin.expireRun,
    { runId },
  );
  return runId;
}
export const begin = mutation({
  args: {
    operation: operationValidator,
    requestKey: v.string(),
    proposalId: v.optional(v.id("catalogueProposals")),
    expectedRevision: v.optional(v.number()),
    feedback: v.optional(v.string()),
    initialPrompt: v.optional(v.string()),
  },
  handler: async (ctx, args) =>
    enqueue(ctx, {
      ...args,
      actor: await requireAdministrator(ctx),
      trigger: "manual",
    }),
});
// Scheduled entry point: shares the pause switch with cron registration. The backlog check and
// enqueue share a transaction so concurrent triggers cannot bypass the limit.
export const beginScheduled = internalMutation({
  args: { requestKey: v.optional(v.string()) },
  returns: v.union(v.id("catalogueGenerationRuns"), v.null()),
  handler: async (ctx, args) => {
    // Defence in depth if a previously registered cron fires during a pause.
    if (!catalogueSchedule.enabled) return null;
    // Match request keys to the configured interval so replays within a slot
    // are harmless while the next scheduled invocation can create new work.
    const requestKey =
      args.requestKey ??
      `catalogue:scheduled:${Math.floor(Date.now() / (catalogueSchedule.intervalMinutes * 60_000))}`;
    // Preserve replay semantics even if the original run filled the review queue.
    const existing = await findRunByRequest(ctx, "system", requestKey);
    if (existing) return existing._id;

    let remaining = scheduledGenerationPolicy.maxUnreviewedProposals;
    // Count every proposal still in the approval workflow, including photographs
    // awaiting review. Read at most the limit, rather than scanning the catalogue.
    for (const status of [
      "pending_review",
      "generating_image",
      "image_review",
    ] as const) {
      const proposals = await ctx.db
        .query("catalogueProposals")
        .withIndex("by_status", (q) => q.eq("status", status))
        .take(remaining);
      remaining -= proposals.length;
      if (remaining === 0) return null;
    }
    return enqueue(ctx, {
      operation: "generate",
      requestKey,
      actor: "system",
      trigger: "scheduled",
    });
  },
});

export const updateProposal = mutation({
  args: {
    proposalId: v.id("catalogueProposals"),
    revision: v.number(),
    content: recipeContentValidator,
    tags: tagsValidator,
  },
  handler: async (ctx, args) => {
    await requireAdministrator(ctx);
    const p = await editable(ctx, args.proposalId, args.revision);
    const meals = await analysisSnapshot(ctx, p._id);
    const { content, findings } = validateGeneratedRecipe(args.content, meals);
    const keepCulinaryReview =
      p.reviewedRevision === p.revision &&
      !culinaryContentChanged(p.content, content);
    // Recalculate deterministic checks (including title duplicates), while
    // retaining the completed culinary findings for unchanged cooking content.
    const previousChecks = validateGeneratedRecipe(p.content, meals).findings;
    const retainedFindings = keepCulinaryReview
      ? p.findings.filter(
          (finding) =>
            !previousChecks.some(
              (check) =>
                check.area === finding.area &&
                check.message === finding.message &&
                check.blocking === finding.blocking,
            ),
        )
      : [];
    await removeImage(ctx, p);
    await ctx.db.patch(p._id, {
      content,
      maintenanceMode: p.sourceMealId ? "recipe" : undefined,
      tags: validateTags(args.tags),
      fingerprint: await recipeFingerprint(content),
      revision: p.revision + 1,
      status: "pending_review",
      findings: [...findings, ...retainedFindings].slice(0, 30),
      reviewedRevision: keepCulinaryReview ? p.revision + 1 : undefined,
      approvedAt: undefined,
      approvedBy: undefined,
      approvedRevision: undefined,
      imageStorageId: undefined,
      imageFingerprint: undefined,
      updatedAt: Date.now(),
    });
    return p.revision + 1;
  },
});
export const reject = mutation({
  args: {
    proposalId: v.id("catalogueProposals"),
    revision: v.number(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAdministrator(ctx);
    const p = await editable(ctx, args.proposalId, args.revision);
    if (!args.reason.trim() || args.reason.length > 2000)
      fail("Provide a concise rejection reason.");
    await removeImage(ctx, p);
    await ctx.db.patch(p._id, {
      status: "rejected",
      rejectionReason: args.reason.trim(),
      revision: p.revision + 1,
      imageStorageId: undefined,
      imageFingerprint: undefined,
      updatedAt: Date.now(),
    });
  },
});
export const deleteProposal = mutation({
  args: { proposalId: v.id("catalogueProposals"), revision: v.number() },
  handler: async (ctx, args) => {
    await requireAdministrator(ctx);
    const p = await ctx.db.get(args.proposalId);
    if (
      !p ||
      p.revision !== args.revision ||
      p.status === "published" ||
      p.status === "generating_image"
    )
      fail("This proposal cannot be deleted now.");
    await removeImage(ctx, p);
    await ctx.db.delete(p._id);
  },
});
export const reviewMetadata = mutation({
  args: {
    rows: v.array(
      v.object({
        metadataId: v.id("catalogueAnalysisMetadata"),
        fingerprint: v.string(),
        tags: tagsValidator,
      }),
    ),
  },
  handler: async (ctx, { rows }) => {
    const actor = await requireAdministrator(ctx);
    if (!rows.length || rows.length > 100)
      fail("Review between one and 100 rows at a time.");
    for (const row of rows) {
      const metadata = await ctx.db.get(row.metadataId);
      if (
        !metadata ||
        metadata.fingerprint !== row.fingerprint ||
        metadata.status !== "proposed"
      )
        fail("Analysis changed. Reload before accepting.");
      const meal = await ctx.db
        .query("catalogueMeals")
        .withIndex("by_meal_id_and_version", (q) =>
          q
            .eq("catalogueMealId", metadata.catalogueMealId)
            .eq("version", metadata.catalogueVersion),
        )
        .unique();
      if (
        !meal ||
        meal.status !== "published" ||
        (await recipeFingerprint(meal)) !== row.fingerprint
      )
        fail("Catalogue content changed; enrich it again.");
      await ctx.db.patch(metadata._id, {
        tags: validateTags(row.tags),
        status: "reviewed",
        reviewedBy: actor,
        reviewedAt: Date.now(),
      });
    }
  },
});
export const publish = mutation({
  args: { proposalId: v.id("catalogueProposals"), revision: v.number() },
  handler: async (ctx, args) => {
    const actor = await requireAdministrator(ctx);
    const p = await ctx.db.get(args.proposalId);
    if (!p) fail("Proposal not found.");
    if (p.status === "published" && p.publishedMealId) return p.publishedMealId;
    if (
      p.revision !== args.revision ||
      p.status !== "image_review" ||
      p.approvedRevision !== p.revision ||
      p.reviewedRevision !== p.revision ||
      p.imageFingerprint !== p.fingerprint ||
      !p.imageStorageId
    )
      fail("Approve the current recipe and image before publishing.");
    if (!(await ctx.db.system.get(p.imageStorageId)))
      fail("The generated image is missing. Generate it again.");
    const { content, findings } = await validateProposal(
      ctx,
      p,
      await analysisSnapshot(ctx, p._id),
    );
    if ([...p.findings, ...findings].some((f) => f.blocking))
      fail("Resolve blocking recipe findings before publication.");
    const published = await ctx.db
      .query("catalogueMeals")
      .withIndex("by_status_and_position", (q) => q.eq("status", "published"))
      .collect();
    const source = await currentProposalSource(ctx, p);
    const position =
      source?.position ?? Math.max(-1, ...published.map((m) => m.position)) + 1;
    if (position >= 1000) fail("Catalogue position limit reached.");
    const base =
      normaliseRecipeText(content.title).replaceAll(" ", "-").slice(0, 120) ||
      "recipe";
    let slug = source?.slug ?? base;
    let suffix = 2;
    while (
      !source &&
      (await ctx.db
        .query("catalogueMeals")
        .withIndex("by_status_and_slug", (q) =>
          q.eq("status", "published").eq("slug", slug),
        )
        .first())
    )
      slug = `${base}-${suffix++}`;
    const now = Date.now();
    const catalogueMealId = source?.catalogueMealId ?? `ai-${p._id}`;
    const latestRevision = source
      ? await ctx.db
          .query("catalogueMeals")
          .withIndex("by_meal_id_and_version", (q) =>
            q.eq("catalogueMealId", catalogueMealId),
          )
          .order("desc")
          .first()
      : null;
    const version = latestRevision ? latestRevision.version + 1 : 1;
    if (source) await ctx.db.patch(source._id, { status: "retired" });
    const id = await ctx.db.insert("catalogueMeals", {
      ...content,
      catalogueMealId,
      version,
      status: "published",
      slug,
      position,
      imageStorageId: p.imageStorageId,
      createdAt: now,
      publishedAt: now,
    });
    const sourceMetadata =
      source && p.maintenanceMode === "image"
        ? await ctx.db
            .query("catalogueAnalysisMetadata")
            .withIndex("by_meal_revision", (q) =>
              q
                .eq("catalogueMealId", source.catalogueMealId)
                .eq("catalogueVersion", source.version),
            )
            .unique()
        : null;
    const metadataReviewed =
      p.maintenanceMode !== "image" ||
      (sourceMetadata?.status === "reviewed" &&
        sourceMetadata.fingerprint === p.fingerprint);
    await ctx.db.insert("catalogueAnalysisMetadata", {
      catalogueMealId,
      catalogueVersion: version,
      fingerprint: p.fingerprint,
      tags: p.tags,
      status: metadataReviewed ? "reviewed" : "proposed",
      reviewedBy: metadataReviewed
        ? p.maintenanceMode === "image"
          ? sourceMetadata?.reviewedBy
          : actor
        : undefined,
      reviewedAt: metadataReviewed
        ? p.maintenanceMode === "image"
          ? sourceMetadata?.reviewedAt
          : now
        : undefined,
      createdAt: now,
    });
    await ctx.db.patch(p._id, {
      status: "published",
      publishedMealId: id,
      publishedBy: actor,
      updatedAt: now,
    });
    return id;
  },
});

export const payload = internalQuery({
  args: { runId: v.id("catalogueGenerationRuns") },
  handler: async (ctx, { runId }) => {
    const run = await ctx.db.get(runId);
    if (!run || !run.active) return null;
    const proposal = run.proposalId ? await ctx.db.get(run.proposalId) : null;
    if (
      run.proposalId &&
      (!proposal ||
        proposal.revision !== run.expectedRevision ||
        !["pending_review", "generating_image", "image_review"].includes(
          proposal.status,
        ))
    )
      fail("The proposal changed before processing began.");
    if (proposal) await currentProposalSource(ctx, proposal);
    const meals = await analysisSnapshot(ctx, run.proposalId);
    const enrichment =
      run.operation === "enrich"
        ? (
            await Promise.all(
              meals
                .filter((m) => m.key.startsWith("catalogue:"))
                .map(async (m) => {
                  const [, catalogueMealId, version] = m.key.split(":");
                  const existing = await ctx.db
                    .query("catalogueAnalysisMetadata")
                    .withIndex("by_meal_revision", (q) =>
                      q
                        .eq("catalogueMealId", catalogueMealId)
                        .eq("catalogueVersion", Number(version)),
                    )
                    .unique();
                  return !existing ||
                    existing.fingerprint !==
                      (await recipeFingerprint(m.content))
                    ? {
                        catalogueMealId,
                        version: Number(version),
                        content: m.content,
                        fingerprint: await recipeFingerprint(m.content),
                      }
                    : null;
                }),
            )
          )
            .filter((m) => m !== null)
            .slice(0, run.config.enrichmentBatchSize)
        : [];
    return { run, proposal, meals, enrichment };
  },
});
export const claim = internalMutation({
  args: { runId: v.id("catalogueGenerationRuns") },
  handler: async (ctx, { runId }) => {
    const run = await ctx.db.get(runId);
    if (
      !run ||
      !run.active ||
      run.status !== "queued" ||
      Date.now() >= run.deadline
    )
      return false;
    await ctx.db.patch(runId, {
      status: "processing",
      phase: run.operation,
      updatedAt: Date.now(),
    });
    return run.attemptToken;
  },
});
async function currentRun(
  ctx: MutationCtx,
  runId: Id<"catalogueGenerationRuns">,
  token: string,
) {
  const run = await ctx.db.get(runId);
  if (
    !run ||
    !run.active ||
    run.status !== "processing" ||
    run.attemptToken !== token
  )
    return null;
  if (Date.now() >= run.deadline) {
    await endFailed(ctx, run, "Generation deadline reached.", true);
    return null;
  }
  if (run.proposalId) {
    const p = await ctx.db.get(run.proposalId);
    const source = p?.sourceMealId ? await ctx.db.get(p.sourceMealId) : null;
    if (
      (p?.sourceMealId && source?.status !== "published") ||
      !p ||
      p.revision !== run.expectedRevision ||
      !["pending_review", "generating_image", "image_review"].includes(p.status)
    ) {
      await endFailed(
        ctx,
        run,
        "Proposal changed while this run was processing. The stale result was discarded.",
      );
      return null;
    }
  }
  return run;
}
export const recordUsage = internalMutation({
  args: {
    runId: v.id("catalogueGenerationRuns"),
    token: v.string(),
    event: telemetryValidator,
  },
  handler: async (ctx, { runId, token, event }) => {
    const run = await ctx.db.get(runId);
    if (run && run.attemptToken === token && run.usage.length < 8)
      await ctx.db.patch(runId, { usage: [...run.usage, event] });
  },
});
// Completed stages remain private and explicitly unapproved. No provider call
// is replayed automatically, and concurrent edits invalidate stale checkpoints.
export const checkpointImprovement = internalMutation({
  args: {
    runId: v.id("catalogueGenerationRuns"),
    token: v.string(),
    progress: v.union(
      v.object({
        stage: v.literal("original_review"),
        findings: v.array(findingValidator),
      }),
      v.object({
        stage: v.literal("authored"),
        content: recipeContentValidator,
        tags: tagsValidator,
        changeSummary: v.array(v.string()),
        findings: v.array(findingValidator),
        originalFindings: v.array(findingValidator),
      }),
    ),
  },
  returns: v.boolean(),
  handler: async (ctx, { runId, token, progress }) => {
    const run = await currentRun(ctx, runId, token);
    if (!run || run.operation !== "improve" || !run.proposalId) return false;
    const proposal = (await ctx.db.get(run.proposalId))!;
    await currentProposalSource(ctx, proposal);
    const now = Date.now();
    let revision = proposal.revision;
    if (progress.stage === "original_review") {
      await ctx.db.patch(proposal._id, {
        findings: progress.findings.slice(0, 30),
        reviewedRevision: undefined,
        updatedAt: now,
      });
    } else {
      if (
        progress.changeSummary.length > 12 ||
        progress.changeSummary.some((change) => change.length > 400)
      )
        fail("Change summary exceeds limits.");
      // Checkpoints are private drafts, not approvals. Full current-catalogue
      // validation still runs on final review, completion and publication.
      const content = prepareRecipeContent(progress.content);
      const tags = validateTags(progress.tags);
      const fingerprint = await recipeFingerprint(content);
      if (
        fingerprint !== proposal.fingerprint ||
        JSON.stringify(tags) !== JSON.stringify(proposal.tags)
      )
        revision++;
      await removeImage(ctx, proposal);
      await ctx.db.patch(proposal._id, {
        content,
        tags,
        fingerprint,
        revision,
        reviewedRevision: undefined,
        maintenanceMode: "recipe",
        status: "pending_review",
        findings: progress.findings.slice(0, 30),
        changeSummary: progress.changeSummary,
        rationale:
          `Critical review: ${progress.originalFindings.map((f) => f.message).join(" ") || "Administrator-requested change."}`.slice(
            0,
            4000,
          ),
        approvedAt: undefined,
        approvedBy: undefined,
        approvedRevision: undefined,
        imageStorageId: undefined,
        imageFingerprint: undefined,
        updatedAt: now,
      });
    }
    await ctx.db.patch(run._id, {
      checkpointStage: progress.stage,
      expectedRevision: revision,
      updatedAt: now,
    });
    return true;
  },
});

export const completeRecipe = internalMutation({
  args: {
    runId: v.id("catalogueGenerationRuns"),
    token: v.string(),
    content: recipeContentValidator,
    tags: tagsValidator,
    concept: v.string(),
    rationale: v.string(),
    findings: v.array(findingValidator),
    changeSummary: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const run = await currentRun(ctx, args.runId, args.token);
    if (!run) return null;
    const { content, findings } = validateGeneratedRecipe(
      args.content,
      await analysisSnapshot(ctx, run.proposalId),
    );
    const allFindings = [...findings, ...args.findings].slice(0, 30);
    if (allFindings.some((f) => f.blocking))
      fail("Recipe still has blocking quality findings.");
    if (args.concept.length > 2000 || args.rationale.length > 4000)
      fail("Recipe explanation exceeds limits.");
    const now = Date.now();
    if (
      args.changeSummary &&
      (args.changeSummary.length > 12 ||
        args.changeSummary.some((change) => change.length > 400))
    )
      fail("Change summary exceeds limits.");
    if (run.operation === "improve" && run.proposalId) {
      const proposal = (await ctx.db.get(run.proposalId))!;
      await currentProposalSource(ctx, proposal);
      await removeImage(ctx, proposal);
      const fingerprint = await recipeFingerprint(content);
      const tags = validateTags(args.tags);
      const revision =
        fingerprint === proposal.fingerprint &&
        JSON.stringify(tags) === JSON.stringify(proposal.tags)
          ? proposal.revision
          : proposal.revision + 1;
      await ctx.db.patch(proposal._id, {
        content,
        tags,
        rationale: args.rationale,
        changeSummary: args.changeSummary,
        maintenanceMode: "recipe",
        initialPrompt: run.feedback ?? proposal.initialPrompt,
        findings: allFindings,
        fingerprint,
        revision,
        reviewedRevision: revision,
        status: "pending_review",
        imageStorageId: undefined,
        imageFingerprint: undefined,
        approvedAt: undefined,
        approvedBy: undefined,
        approvedRevision: undefined,
        updatedAt: now,
      });
      await ctx.db.patch(run._id, {
        status: "succeeded",
        active: false,
        phase: "complete",
        updatedAt: now,
      });
      return proposal._id;
    }

    const id = await ctx.db.insert("catalogueProposals", {
      content,
      tags: validateTags(args.tags),
      concept: args.concept,
      initialPrompt:
        run.initialPrompt ??
        (run.proposalId
          ? (await ctx.db.get(run.proposalId))?.initialPrompt
          : undefined),
      rationale: args.rationale,
      changeSummary: args.changeSummary,
      sourceMealId: run.proposalId
        ? (await ctx.db.get(run.proposalId))?.sourceMealId
        : undefined,
      maintenanceMode:
        run.proposalId && (await ctx.db.get(run.proposalId))?.sourceMealId
          ? "recipe"
          : undefined,
      findings: allFindings,
      status: "pending_review",
      revision: 1,
      reviewedRevision: 1,
      fingerprint: await recipeFingerprint(content),
      createdBy: run.actor,
      createdAt: now,
      updatedAt: now,
      ...(run.proposalId ? { replacesProposalId: run.proposalId } : {}),
    });
    if (run.proposalId) {
      const old = await ctx.db.get(run.proposalId);
      if (old) {
        await removeImage(ctx, old);
        await ctx.db.patch(old._id, {
          status: "superseded",
          revision: old.revision + 1,
          imageStorageId: undefined,
          imageFingerprint: undefined,
          updatedAt: now,
        });
      }
    }
    await ctx.db.patch(run._id, {
      proposalId: id,
      status: "succeeded",
      active: false,
      phase: "complete",
      updatedAt: now,
    });
    return id;
  },
});
export const completeReview = internalMutation({
  args: {
    runId: v.id("catalogueGenerationRuns"),
    token: v.string(),
    findings: v.array(findingValidator),
  },
  handler: async (ctx, args) => {
    const run = await currentRun(ctx, args.runId, args.token);
    if (!run?.proposalId) return;
    const p = (await ctx.db.get(run.proposalId))!;
    const validation = validateGeneratedRecipe(
      p.content,
      await analysisSnapshot(ctx, p._id),
    );
    const findings = [...validation.findings, ...args.findings].slice(0, 30);
    await ctx.db.patch(p._id, {
      findings,
      reviewedRevision: findings.some((f) => f.blocking)
        ? undefined
        : p.revision,
      updatedAt: Date.now(),
    });
    await ctx.db.patch(run._id, {
      active: false,
      status: "succeeded",
      phase: "complete",
      updatedAt: Date.now(),
    });
  },
});
export const completeImage = internalMutation({
  args: {
    runId: v.id("catalogueGenerationRuns"),
    token: v.string(),
    imageStorageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const previousRun = await ctx.db.get(args.runId);
    const previousProposal = previousRun?.proposalId
      ? await ctx.db.get(previousRun.proposalId)
      : null;
    // Completion replay must never delete an image already attached or published.
    if (previousProposal?.imageStorageId === args.imageStorageId) return;
    const run = await currentRun(ctx, args.runId, args.token);
    if (!run?.proposalId) {
      await ctx.storage.delete(args.imageStorageId);
      return;
    }
    const p = (await ctx.db.get(run.proposalId))!;
    if (p.status !== "generating_image" || p.approvedRevision !== p.revision) {
      await ctx.storage.delete(args.imageStorageId);
      return;
    }
    await removeImage(ctx, p);
    await ctx.db.patch(p._id, {
      imageStorageId: args.imageStorageId,
      imageFingerprint: p.fingerprint,
      status: "image_review",
      updatedAt: Date.now(),
    });
    await ctx.db.patch(run._id, {
      active: false,
      status: "succeeded",
      phase: "complete",
      updatedAt: Date.now(),
    });
  },
});
export const completeEnrichment = internalMutation({
  args: {
    runId: v.id("catalogueGenerationRuns"),
    token: v.string(),
    rows: v.array(
      v.object({
        catalogueMealId: v.string(),
        version: v.number(),
        fingerprint: v.string(),
        tags: tagsValidator,
      }),
    ),
  },
  handler: async (ctx, args) => {
    const run = await currentRun(ctx, args.runId, args.token);
    if (!run) return;
    if (args.rows.length > generationConfig.enrichmentBatchSize)
      fail("Enrichment batch too large.");
    for (const row of args.rows) {
      const meal = await ctx.db
        .query("catalogueMeals")
        .withIndex("by_meal_id_and_version", (q) =>
          q
            .eq("catalogueMealId", row.catalogueMealId)
            .eq("version", row.version),
        )
        .unique();
      if (
        !meal ||
        meal.status !== "published" ||
        (await recipeFingerprint(meal)) !== row.fingerprint
      )
        continue;
      const existing = await ctx.db
        .query("catalogueAnalysisMetadata")
        .withIndex("by_meal_revision", (q) =>
          q
            .eq("catalogueMealId", row.catalogueMealId)
            .eq("catalogueVersion", row.version),
        )
        .unique();
      if (existing?.fingerprint === row.fingerprint) continue;
      const values = {
        catalogueMealId: row.catalogueMealId,
        catalogueVersion: row.version,
        fingerprint: row.fingerprint,
        tags: validateTags(row.tags),
        status: "proposed" as const,
        createdAt: Date.now(),
      };
      if (existing) await ctx.db.replace(existing._id, values);
      else await ctx.db.insert("catalogueAnalysisMetadata", values);
    }
    await ctx.db.patch(run._id, {
      active: false,
      status: "succeeded",
      phase: "complete",
      updatedAt: Date.now(),
    });
  },
});
async function endFailed(
  ctx: MutationCtx,
  run: Doc<"catalogueGenerationRuns">,
  failure: string,
  timedOut = false,
) {
  await ctx.db.patch(run._id, {
    active: false,
    status: timedOut ? "timed_out" : "failed",
    phase: "complete",
    failure: failure.slice(0, 1000),
    updatedAt: Date.now(),
  });
  if (run.operation === "image" && run.proposalId) {
    const p = await ctx.db.get(run.proposalId);
    if (p?.status === "generating_image" && p.revision === run.expectedRevision)
      await ctx.db.patch(p._id, {
        status: "pending_review",
        updatedAt: Date.now(),
      });
  }
}
export const failRun = internalMutation({
  args: {
    runId: v.id("catalogueGenerationRuns"),
    token: v.string(),
    failure: v.string(),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (run?.active && run.attemptToken === args.token)
      await endFailed(ctx, run, args.failure);
  },
});
export const expireRun = internalMutation({
  args: { runId: v.id("catalogueGenerationRuns") },
  handler: async (ctx, { runId }) => {
    const run = await ctx.db.get(runId);
    if (run?.active && Date.now() >= run.deadline)
      await endFailed(
        ctx,
        run,
        "Generation timed out. Inspect the run before retrying; the provider may have charged for the request.",
        true,
      );
  },
});

export const imageAttached = internalQuery({
  args: {
    proposalId: v.id("catalogueProposals"),
    imageStorageId: v.id("_storage"),
  },
  returns: v.boolean(),
  handler: async (ctx, args) =>
    (await ctx.db.get(args.proposalId))?.imageStorageId === args.imageStorageId,
});

export const setRunPhase = internalMutation({
  args: {
    runId: v.id("catalogueGenerationRuns"),
    token: v.string(),
    phase: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { runId, token, phase }) => {
    const run = await ctx.db.get(runId);
    if (run?.active && run.attemptToken === token && Date.now() < run.deadline)
      await ctx.db.patch(runId, {
        phase: phase.slice(0, 80),
        updatedAt: Date.now(),
      });
    return null;
  },
});
