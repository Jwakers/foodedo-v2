import type { FunctionReturnType } from "convex/server";
import type { api } from "../../../convex/_generated/api";

export type Proposal = NonNullable<
  FunctionReturnType<typeof api.catalogueAdmin.getProposal>
>;

export const proposalStatusLabels: Record<Proposal["status"], string> = {
  pending_review: "Review recipe",
  generating_image: "Creating photograph",
  image_review: "Review photograph",
  published: "Published",
  rejected: "Rejected",
  superseded: "Replaced",
};

export function needsProposalReview(status: Proposal["status"]) {
  return (
    status === "pending_review" ||
    status === "generating_image" ||
    status === "image_review"
  );
}

export function getReviewGuidance(proposal: Proposal, editing: boolean) {
  if (editing)
    return {
      heading: "Edit recipe",
      description:
        "Title, description and classification edits keep an existing culinary review. Changes to ingredients, method, cooking notes, servings, timings or oven settings need a new review. Saving clears any photograph approval.",
    };
  if (
    proposal.maintenanceMode === "image" &&
    proposal.status === "pending_review"
  )
    return {
      heading: "Next: generate a replacement photograph",
      description:
        "The published recipe text is retained. Generate a new paid photograph, then review it before updating the catalogue.",
    };
  if (proposal.status === "image_review")
    return {
      heading: "Next: check the photograph, then publish",
      description:
        "Check that the image faithfully shows the ingredients, sides and cooked dish. Publishing makes it available to everyone.",
    };
  const reviewed = proposal.reviewedRevision === proposal.revision;
  const blocked = proposal.findings.some((finding) => finding.blocking);
  if (reviewed && !blocked)
    return {
      heading: "Next: check the recipe, then approve photography",
      description:
        "Open the ingredients and method below. Approval starts a paid image generation; the recipe stays private.",
    };
  if (reviewed && blocked)
    return {
      heading: "Next: resolve the culinary findings",
      description:
        "Resolve the blocking findings below by editing or regenerating the recipe before approval.",
    };
  return {
    heading: "Next: review the saved recipe",
    description:
      "Run culinary review after editing. It checks cookability, portions, timings and safety, reports findings, and does not rewrite the recipe. This uses a paid AI call.",
  };
}
