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
} from "./contracts";
import { safeFetch, readBoundedBytes } from "./network";
import { validateDownloadedRecipeImage } from "./images";
import {
  extractTextCandidate,
  extractUrlCandidate,
  type RecipeSourceCandidate,
} from "./source";
import { organiseCandidate } from "./extraction";
export {
  extractHtmlCandidate,
  extractTextCandidate,
  extractUrlCandidate,
} from "./source";
export { organiseCandidate } from "./extraction";
const NORMALIZATION_VERSION = 9;
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
      candidate = await extractUrlCandidate(payload.sourceUrl);
    } else {
      if (!payload.inputText) {
        throw new ImportFailure("no_recipe", "Recipe text is missing.");
      }
      candidate = extractTextCandidate(payload.inputText);
    }

    await ctx.runMutation(internal.recipeImports.setPhase, {
      importId,
      attempt,
      phase: "organising",
    });

    const { recipe, metadataProvenance, normalizationWarnings } =
      await organiseCandidate(candidate, undefined, startedAt + 110_000);
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
        method: payload.sourceType,
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
        normalizationVersion: NORMALIZATION_VERSION,
        contentFingerprint: fingerprint,
        metadataProvenance,
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
      result: recipeId === null ? "stale" : "saved",
      reviewIssues: getRecipeReviewIssues({
        ...recipe,
        source: {
          type: "import",
          method: payload.sourceType,
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
