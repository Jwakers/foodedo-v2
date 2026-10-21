import { ConvexError } from "convex/values";
import type { Doc } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { prepareRecipeContent } from "../../../src/lib/domain/recipes";
import {
  recipeFingerprint,
  validateGeneratedRecipe,
  type AnalysisMeal,
} from "../../../src/lib/domain/catalogue-generation";

type ReadCtx = QueryCtx | MutationCtx;

export async function currentProposalSource(
  ctx: ReadCtx,
  proposal: Doc<"catalogueProposals">,
) {
  if (!proposal.sourceMealId) return null;
  const source = await ctx.db.get(proposal.sourceMealId);
  if (!source || source.status !== "published")
    throw new ConvexError(
      "The catalogue recipe changed. Start a new maintenance draft from the current revision.",
    );
  return source;
}

export async function validateProposal(
  ctx: ReadCtx,
  proposal: Doc<"catalogueProposals">,
  meals: AnalysisMeal[],
) {
  const source = await currentProposalSource(ctx, proposal);
  if (proposal.maintenanceMode === "image") {
    if (
      !source ||
      (await recipeFingerprint(proposal.content)) !==
        (await recipeFingerprint(source))
    )
      throw new ConvexError(
        "An image-only update must preserve the published recipe exactly.",
      );
    // Previously approved text is unchanged. Do not impose new authoring rules
    // on a legacy recipe just to replace its photograph.
    return { content: prepareRecipeContent(proposal.content), findings: [] };
  }
  return validateGeneratedRecipe(proposal.content, meals);
}
