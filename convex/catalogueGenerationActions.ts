"use node";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  gatewayGenerationClient,
  enrichmentSchema,
  reviewSchema,
} from "./lib/catalogueGeneration/models";
import {
  generateProposal,
  improveProposal,
  photographyPrompt,
  culinaryComparisons,
} from "./lib/catalogueGeneration/pipeline";
import {
  ENRICHMENT_PROMPT,
  REVIEW_PROMPT,
} from "./lib/catalogueGeneration/prompts";
import { validateDownloadedRecipeImage } from "./lib/recipeImport/images";

export const process = internalAction({
  args: { runId: v.id("catalogueGenerationRuns") },
  returns: v.null(),
  handler: async (ctx, { runId }) => {
    const token = await ctx.runMutation(internal.catalogueAdmin.claim, {
      runId,
    });
    if (!token) return null;
    try {
      const payload = await ctx.runQuery(internal.catalogueAdmin.payload, {
        runId,
      });
      if (!payload) return null;
      const { run, proposal, meals, enrichment } = payload;
      const client = gatewayGenerationClient(
        run.config,
        run.deadline,
        async (event) => {
          try {
            await ctx.runMutation(internal.catalogueAdmin.recordUsage, {
              runId,
              token,
              event,
            });
          } catch {
            console.error("catalogue_telemetry_failed", { runId });
          }
        },
        async (phase) => {
          try {
            await ctx.runMutation(internal.catalogueAdmin.setRunPhase, {
              runId,
              token,
              phase,
            });
          } catch {
            console.error("catalogue_phase_update_failed", { runId });
          }
        },
      );
      if (run.operation === "enrich") {
        const input = enrichment.map((m) => ({
          key: `${m.catalogueMealId}:${m.version}`,
          recipe: m.content,
        }));
        const result = input.length
          ? await client.text(
              "enrichment",
              enrichmentSchema,
              ENRICHMENT_PROMPT,
              {
                recipes: input,
                reviewedVocabulary: meals.flatMap((m) =>
                  m.tags ? [m.tags] : [],
                ),
              },
            )
          : { rows: [] };
        const keys = new Set(result.rows.map((r) => r.key));
        if (
          keys.size !== input.length ||
          result.rows.length !== input.length ||
          input.some((r) => !keys.has(r.key))
        )
          throw new Error(
            "Enrichment did not return exactly the requested recipes.",
          );
        await ctx.runMutation(internal.catalogueAdmin.completeEnrichment, {
          runId,
          token,
          rows: result.rows.map((row) => {
            const source = enrichment.find(
              (m) => `${m.catalogueMealId}:${m.version}` === row.key,
            )!;
            return {
              catalogueMealId: source.catalogueMealId,
              version: source.version,
              fingerprint: source.fingerprint,
              tags: row.tags,
            };
          }),
        });
      } else if (run.operation === "image") {
        if (
          !proposal ||
          proposal.revision !== run.expectedRevision ||
          proposal.status !== "generating_image"
        )
          throw new Error("Approved proposal changed.");
        const image = await client.image(
          photographyPrompt(proposal.content, run.config.imageStyleVersion),
        );
        if (
          image.bytes.byteLength > run.config.imageBytes ||
          !validateDownloadedRecipeImage(image.bytes, image.mediaType)
        )
          throw new Error(
            "Generated image failed format, size or dimension checks.",
          );
        const imageStorageId = await ctx.storage.store(
          new Blob([new Uint8Array(image.bytes)], { type: image.mediaType }),
        );
        try {
          await ctx.runMutation(internal.catalogueAdmin.completeImage, {
            runId,
            token,
            imageStorageId,
          });
        } catch (error) {
          // A transport failure may follow a committed attachment. Never delete a
          // potentially published image without confirming it is unreferenced.
          try {
            const attached = await ctx.runQuery(
              internal.catalogueAdmin.imageAttached,
              { proposalId: proposal._id, imageStorageId },
            );
            if (!attached) await ctx.storage.delete(imageStorageId);
          } catch {
            console.error("catalogue_image_cleanup_unconfirmed", {
              runId,
              imageStorageId,
            });
          }
          throw error;
        }
      } else if (run.operation === "review") {
        if (!proposal) throw new Error("Proposal no longer exists.");
        const review = await client.text(
          "culinary_review",
          reviewSchema,
          REVIEW_PROMPT,
          {
            recipe: proposal.content,
            tags: proposal.tags,
            ...culinaryComparisons(proposal.content, meals),
          },
        );
        await ctx.runMutation(internal.catalogueAdmin.completeReview, {
          runId,
          token,
          findings: review.findings,
        });
      } else {
        if (run.operation === "regenerate" && !proposal)
          throw new Error("Proposal no longer exists.");
        const result =
          (run.operation === "improve" ||
            (run.operation === "regenerate" && proposal?.sourceMealId)) &&
          proposal
            ? await improveProposal(
                client,
                proposal.content,
                proposal.tags,
                meals,
                run.operation === "improve"
                  ? run.feedback
                  : (run.feedback ?? proposal.initialPrompt),
              )
            : await generateProposal(
                client,
                meals,
                run.operation === "regenerate" && proposal
                  ? {
                      concept: proposal.concept,
                      rationale: proposal.rationale,
                      content: proposal.content,
                      feedback: run.feedback,
                    }
                  : undefined,
                run.initialPrompt,
              );
        const saved = await ctx.runMutation(
          internal.catalogueAdmin.completeRecipe,
          { runId, token, ...result },
        );
        if (!saved)
          throw new Error(
            "Proposal changed or run expired before the result could be saved.",
          );
      }
    } catch (error) {
      console.error("catalogue_generation_failed", {
        runId,
        error:
          error instanceof Error
            ? error.message.slice(0, 1000)
            : "Unknown error",
      });
      await ctx.runMutation(internal.catalogueAdmin.failRun, {
        runId,
        token,
        failure:
          error instanceof Error
            ? error.message.slice(0, 1000)
            : "Recipe generation failed.",
      });
    }
    return null;
  },
});
