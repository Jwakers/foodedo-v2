import type { Id } from "../../_generated/dataModel";
import type { QueryCtx, MutationCtx } from "../../_generated/server";
import {
  type AnalysisMeal,
  recipeFingerprint,
} from "../../../src/lib/domain/catalogue-generation";
import { generationConfig } from "./config";

export async function analysisSnapshot(
  ctx: QueryCtx | MutationCtx,
  excludeProposalId?: Id<"catalogueProposals">,
): Promise<AnalysisMeal[]> {
  const published = await ctx.db
    .query("catalogueMeals")
    .withIndex("by_status_and_position", (q) => q.eq("status", "published"))
    .take(generationConfig.catalogueLimit + 1);
  if (published.length > generationConfig.catalogueLimit)
    throw new Error(
      "Catalogue exceeds the analysis limit; increase the bounded snapshot deliberately.",
    );
  const proposals = (
    await Promise.all(
      (["pending_review", "generating_image", "image_review"] as const).map(
        (status) =>
          ctx.db
            .query("catalogueProposals")
            .withIndex("by_status", (q) => q.eq("status", status))
            .take(201),
      ),
    )
  ).flat();
  if (proposals.length > 200)
    throw new Error("Review pending proposals before generating more recipes.");
  // Exclude only the recipe being revised from its own duplicate check. Other
  // jobs must still see both the published recipe and any pending edited text.
  const target = excludeProposalId ? await ctx.db.get(excludeProposalId) : null;
  const source = target?.sourceMealId
    ? await ctx.db.get(target.sourceMealId)
    : null;
  const meals: AnalysisMeal[] = await Promise.all(
    published
      .filter((meal) => meal.catalogueMealId !== source?.catalogueMealId)
      .map(async (meal) => {
        const metadata = await ctx.db
          .query("catalogueAnalysisMetadata")
          .withIndex("by_meal_revision", (q) =>
            q
              .eq("catalogueMealId", meal.catalogueMealId)
              .eq("catalogueVersion", meal.version),
          )
          .unique();
        return {
          key: `catalogue:${meal.catalogueMealId}:${meal.version}`,
          content: meal,
          ...(metadata?.status === "reviewed" &&
          metadata.fingerprint === (await recipeFingerprint(meal))
            ? { tags: metadata.tags }
            : {}),
        };
      }),
  );
  return [
    ...meals,
    ...proposals
      .filter((p) => p._id !== excludeProposalId)
      .map((p) => ({
        key: p._id,
        content: p.content,
        isCatalogueRevision: Boolean(p.sourceMealId),
        ...(p.reviewedRevision === p.revision ? { tags: p.tags } : {}),
      })),
  ];
}
