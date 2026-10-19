"use node";
import { createHash } from "node:crypto";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import type { ActionCtx } from "../../_generated/server";
import {
  getRecipeReviewIssues,
  type RecipeContent,
} from "../../../src/lib/domain/recipes";
import {
  ImportFailure,
  importFailureCode,
  RECIPE_IMPORT_LIMITS,
  RECIPE_NORMALIZATION_VERSION,
} from "./contracts";
import { safeFetch, readBoundedBytes } from "./network";
import { validateDownloadedRecipeImage } from "./images";
import { type RecipeSourceCandidate } from "./source";
import { organiseCandidate } from "./extraction";
import { acquireRecipeSource } from "./sources";
import { createGatewayRecipeImportModelClient } from "./models";
export {
  extractHtmlCandidate,
  extractTextCandidate,
  extractUrlCandidate,
} from "./source";
export { organiseCandidate } from "./extraction";
import {
  draftRecipeText,
  preserveDraftMetadataProvenance,
} from "../../../src/lib/domain/recipe-import-draft";
const MAX_IMAGE_BYTES = RECIPE_IMPORT_LIMITS.imageBytes;

export async function processImportHandler(
  ctx: ActionCtx,
  { importId, attempt }: { importId: Id<"recipeImports">; attempt: number },
) {
  const claimed = await ctx.runMutation(internal.recipeImports.claimAttempt, {
    importId,
    attempt,
  });
  if (!claimed) return null;

  const startedAt = Date.now();
  let sourceMs: number | undefined;
  let normalizationMs: number | undefined;
  let modelCalls = 0;
  try {
    const payload = await ctx.runQuery(internal.recipeImports.getPayload, {
      importId,
      attempt,
    });
    if (payload === null) return null;

    let candidate: RecipeSourceCandidate;
    if (payload.sourceType === "url") {
      if (!payload.sourceUrl) {
        throw new ImportFailure("invalid_url", "Recipe URL is missing.");
      }
      candidate = await acquireRecipeSource({
        type: "url",
        url: payload.sourceUrl,
      });
    } else {
      if (!payload.inputText) {
        throw new ImportFailure("no_recipe", "Recipe text is missing.");
      }
      candidate = await acquireRecipeSource({
        type: "text",
        text: payload.recoveredDraft
          ? `Additional recipe text:\n${payload.inputText}\nPreviously recovered recipe (not new publisher evidence):\n${draftRecipeText(payload.recoveredDraft.recipe, payload.recoveredDraft.metadataProvenance)}`
          : payload.inputText,
      });
      if (payload.sourceUrl) candidate.sourceUrl = payload.sourceUrl;
      if (payload.sourceName) candidate.sourceName = payload.sourceName;
      if (payload.sourceAuthor) candidate.sourceAuthor = payload.sourceAuthor;
      if (payload.sourceImageUrls)
        candidate.sourceImageUrls = payload.sourceImageUrls;
    }

    sourceMs = Date.now() - startedAt;
    await ctx.runMutation(internal.recipeImports.setPhase, {
      importId,
      attempt,
      phase: "organising",
    });

    const normalizationStartedAt = Date.now();
    const modelClient = createGatewayRecipeImportModelClient((event) => {
      modelCalls++;
      console.info("recipe_import_job_model_task", {
        importId,
        attempt,
        ...event,
      });
    });
    const outcome = await organiseCandidate(
      candidate,
      modelClient,
      startedAt + 110_000,
    );
    normalizationMs = Date.now() - normalizationStartedAt;
    const persistenceStartedAt = Date.now();
    const { recipe, metadataProvenance, normalizationWarnings } = outcome;
    const retainedProvenance = payload.recoveredDraft
      ? preserveDraftMetadataProvenance(
          payload.recoveredDraft.recipe,
          payload.recoveredDraft.metadataProvenance,
          recipe,
          metadataProvenance,
        )
      : metadataProvenance;
    if (outcome.status === "draft") {
      await ctx.runMutation(internal.recipeImports.stageDraft, {
        importId,
        attempt,
        recipe,
        issues: outcome.issues,
        metadataProvenance: retainedProvenance,
        ...(candidate.sourceName ? { sourceName: candidate.sourceName } : {}),
        ...(candidate.sourceAuthor
          ? { sourceAuthor: candidate.sourceAuthor }
          : {}),
        ...(candidate.sourceImageUrls
          ? { sourceImageUrls: candidate.sourceImageUrls }
          : {}),
      });
      console.info("recipe_import_draft_staged", {
        importId,
        attempt,
        durationMs: Date.now() - startedAt,
        sourceMs,
        normalizationMs,
        persistenceMs: Date.now() - persistenceStartedAt,
        modelCalls,
      });
      return null;
    }
    const fingerprint = contentFingerprint(recipe);
    await ctx.runMutation(internal.recipeImports.setPhase, {
      importId,
      attempt,
      phase: "saving",
    });
    const recipeId = await ctx.runMutation(
      internal.recipeImports.completeImport,
      {
        importId,
        attempt,
        recipe,
        method: payload.method,
        ...(candidate.sourceUrl === undefined
          ? {}
          : { sourceUrl: candidate.sourceUrl }),
        ...(candidate.sourceName === undefined
          ? {}
          : { sourceName: candidate.sourceName }),
        ...(candidate.sourceAuthor === undefined
          ? {}
          : { sourceAuthor: candidate.sourceAuthor }),
        ...(candidate.sourceImageUrls === undefined
          ? {}
          : { sourceImageUrls: candidate.sourceImageUrls }),
        normalizationVersion: RECIPE_NORMALIZATION_VERSION,
        contentFingerprint: fingerprint,
        metadataProvenance: retainedProvenance,
        ...(normalizationWarnings.length === 0
          ? {}
          : { normalizationWarnings }),
      },
    );
    console.info("recipe_import_completed", {
      importId,
      attempt,
      extractor: candidate.extractor,
      durationMs: Date.now() - startedAt,
      sourceMs,
      normalizationMs,
      persistenceMs: Date.now() - persistenceStartedAt,
      modelCalls,
      result: recipeId === null ? "stale" : "saved",
      reviewIssues: getRecipeReviewIssues({
        ...recipe,
        source: {
          type: "import",
          method: payload.method,
          importedAt: startedAt,
          ...(normalizationWarnings.length === 0
            ? {}
            : { normalizationWarnings }),
        },
      }),
      normalizationWarnings: normalizationWarnings.map(
        (warning) => `${warning.area}:${warning.code}`,
      ),
    });
  } catch (error) {
    const failureCode = importFailureCode(error);
    console.error("recipe_import_failed", {
      importId,
      attempt,
      durationMs: Date.now() - startedAt,
      failureCode,
      sourceMs,
      normalizationMs,
      modelCalls,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    await ctx.runMutation(internal.recipeImports.failImport, {
      importId,
      attempt,
      failureCode,
      ...(error instanceof ImportFailure && error.details
        ? { failureDetails: error.details }
        : {}),
      ...(error instanceof ImportFailure && error.sourceIds
        ? { failureSourceIds: error.sourceIds }
        : {}),
      ...(error instanceof ImportFailure && error.reasons
        ? { failureReasons: error.reasons }
        : {}),
    });
  }
  return null;
}

export async function copySourceImageHandler(
  ctx: ActionCtx,
  {
    recipeId,
    imageUrls,
    expectedContentFingerprint,
  }: {
    recipeId: Id<"recipes">;
    imageUrls: string[];
    expectedContentFingerprint: string;
  },
) {
  for (const imageUrl of imageUrls.slice(0, 3)) {
    let storageId: Awaited<ReturnType<typeof ctx.storage.store>> | undefined;
    try {
      const response = await safeFetch(imageUrl, MAX_IMAGE_BYTES, "image");
      const declaredContentType = response.headers
        .get("content-type")
        ?.split(";")[0];
      const bytes = await readBoundedBytes(response, MAX_IMAGE_BYTES);
      const image = validateDownloadedRecipeImage(bytes, declaredContentType);
      if (!image) continue;
      storageId = await ctx.storage.store(
        new Blob([bytes], { type: image.contentType }),
      );
      const attached = await ctx.runMutation(
        internal.recipeImports.attachImage,
        {
          recipeId,
          imageStorageId: storageId,
          expectedContentFingerprint,
        },
      );
      if (!attached) {
        await ctx.storage.delete(storageId);
        storageId = undefined;
      }
      if (attached) return null;
    } catch (error) {
      if (storageId !== undefined) {
        try {
          await ctx.storage.delete(storageId);
        } catch (cleanupError) {
          console.warn("recipe_import_image_cleanup_failed", {
            recipeId,
            errorName:
              cleanupError instanceof Error
                ? cleanupError.name
                : "UnknownError",
          });
        }
      }
      console.warn("recipe_import_image_candidate_failed", {
        recipeId,
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
    }
  }
  return null;
}

function contentFingerprint(recipe: RecipeContent) {
  return createHash("sha256").update(JSON.stringify(recipe)).digest("hex");
}
