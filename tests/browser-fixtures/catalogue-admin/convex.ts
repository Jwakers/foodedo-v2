import { culinaryContentChanged } from "../../../src/lib/domain/catalogue-generation";
import { generationConfig } from "../../../convex/lib/catalogueGeneration/config";
import { useSyncExternalStore } from "react";
import { prepareRecipeContent } from "../../../src/lib/domain/recipes";
import { getFunctionName, type FunctionReference } from "convex/server";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
const role = new URLSearchParams(location.search).get("role") ?? "admin";
const listeners = new Set<() => void>();
let version = 0;
function changed() {
  version++;
  listeners.forEach((fn) => fn());
}
function useObservedVersion() {
  useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => version,
  );
}
const content: Doc<"catalogueProposals">["content"] = {
  title: "Lemon chickpea rice",
  description: "A filling lemon rice dish.",
  servings: 4,
  prepMinutes: 10,
  cookMinutes: 20,
  notes: [
    { id: "draining", label: "Chickpeas", text: "Drain the chickpeas first." },
  ],
  proteinCategory: "meat-free",
  costBand: "budget",
  ingredients: [
    {
      id: "rice",
      name: "rice",
      quantity: "300",
      unit: "g",
      shoppingCategory: "pantry",
    },
    {
      id: "chickpeas",
      name: "chickpeas",
      quantity: "400",
      unit: "g",
      shoppingCategory: "pantry",
      noteRefs: ["draining"],
    },
  ],
  steps: [
    { id: "one", text: "Cook the rice for 15 minutes." },
    {
      id: "two",
      text: "Warm the chickpeas and fold into the rice.",
      noteRefs: ["draining"],
    },
  ],
};
const imageUrl =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=";
let published: Doc<"catalogueMeals"> = {
  ...content,
  _id: "meal-one" as Id<"catalogueMeals">,
  _creationTime: 1,
  catalogueMealId: "lemon-rice",
  version: 1,
  status: "published",
  slug: "lemon-rice",
  position: 0,
  createdAt: 1,
  publishedAt: 1,
};
type FixtureProposal = Doc<"catalogueProposals"> & {
  imageUrl: string | null;
  nearest: unknown[];
  sourceMeal?: Doc<"catalogueMeals">;
  latestRun?: Doc<"catalogueGenerationRuns">;
  photoGuidance?: string;
};
let proposal: FixtureProposal | null = null;
const proposals = new Map<string, FixtureProposal>();
window.addEventListener("fixture:remote-update", () => {
  proposal = proposals.values().next().value ?? null;
  if (!proposal) return;
  proposal = {
    ...proposal,
    revision: proposal.revision + 1,
    content: { ...proposal.content, title: "Updated by another administrator" },
    reviewedRevision: undefined,
  };
  proposals.set(proposal._id, proposal);
  changed();
});
let metadata: Doc<"catalogueAnalysisMetadata"> | null = null;
export function useConvexAuth() {
  return { isAuthenticated: role !== "guest", isLoading: false };
}
export function useQuery(
  reference: FunctionReference<"query">,
  args?: unknown,
) {
  useObservedVersion();
  if (args === "skip") return undefined;
  const name = getFunctionName(reference).split(":")[1];
  if (name === "list")
    return {
      meals: [
        {
          _id: published._id,
          title: published.title,
          version: published.version,
          proteinCategory: published.proteinCategory,
        },
      ],
      activeRun: null,
    };
  if (name === "getMeal")
    return (args as { mealId: string }).mealId === published._id
      ? {
          mealId: published._id,
          version: published.version,
          content: prepareRecipeContent(published),
          imageUrl,
        }
      : null;
  if (name === "access") return { isAdmin: role === "admin" };
  if (name === "overview")
    return {
      proposals: [...proposals.values()].map((p) => ({
        ...p,
        title: p.content.title,
      })),
      runs: [],
      activeRun: null,
      statistics: { total: 112, classified: 90 },
    };
  if (name === "getProposal")
    return proposals.get((args as { proposalId: string }).proposalId) ?? null;
  if (name === "analysisRows")
    return [
      {
        title: content.title,
        catalogueMealId: "existing",
        version: 1,
        metadata,
      },
    ];
}
export function useMutation(reference: FunctionReference<"mutation">) {
  return async (args: Record<string, unknown>) => {
    const name = getFunctionName(reference).split(":")[1];
    if (
      name === "updateProposal" &&
      new URLSearchParams(location.search).get("fail") === "update"
    )
      throw new Error("Could not save recipe. Please retry.");
    if (name === "start") {
      const existing = [...proposals.values()].find(
        (p) =>
          p.sourceMealId === args.mealId &&
          ["pending_review", "generating_image", "image_review"].includes(
            p.status,
          ),
      );
      if (existing) {
        proposal = existing;
        return { proposalId: existing._id, runId: null, reused: true };
      }
    }
    if (
      (name === "start" && args.mode === "image") ||
      (name === "begin" && args.operation === "image")
    )
      document.body.dataset.photoGuidance = String(args.feedback ?? "");
    if (args.proposalId)
      proposal = proposals.get(String(args.proposalId)) ?? null;
    if ((name === "begin" && args.operation === "generate") || name === "start")
      proposal = {
        _id: `proposal-${proposals.size + 1}` as Id<"catalogueProposals">,
        _creationTime: 1,
        content: args.initialPrompt
          ? { ...content, title: "Rustic shepherd’s pie" }
          : content,
        initialPrompt: (name === "start" && args.mode === "image"
          ? undefined
          : (args.feedback ?? args.initialPrompt)) as string | undefined,
        sourceMealId: name === "start" ? published._id : undefined,
        sourceMeal: name === "start" ? { ...published } : undefined,
        maintenanceMode:
          name === "start" ? (args.mode as "recipe" | "image") : undefined,
        changeSummary:
          name === "start" && args.mode === "recipe"
            ? ["Improved the sauce sequence and consistency."]
            : undefined,
        tags: {
          cuisines: ["mediterranean"],
          mealOccasion: "dinner",
          cookingMethods: ["simmered"],
          proteinSource: "chickpeas",
          carbBase: "rice",
          flavourProfile: ["lemon"],
          complexity: "simple",
          vegetarian: "yes",
          vegan: "yes",
        },
        concept: "A filling chickpea rice main",
        rationale: "Adds an easy budget meat-free meal.",
        status: "pending_review",
        revision: 1,
        reviewedRevision: 1,
        findings: [],
        fingerprint: "fixture",
        createdBy: "admin",
        createdAt: 1,
        updatedAt: 1,
        imageUrl: null,
        nearest: [],
      };
    if (name === "start" && proposal && args.mode === "image")
      proposal = {
        ...proposal,
        status: "image_review",
        imageUrl,
        photoGuidance: String(args.feedback ?? ""),
      };
    const failedStage = new URLSearchParams(location.search).get("fail");
    if (
      name === "start" &&
      args.mode === "recipe" &&
      proposal &&
      failedStage?.startsWith("improvement-")
    ) {
      const authored = failedStage === "improvement-review";
      proposal = {
        ...proposal,
        reviewedRevision: undefined,
        findings: authored
          ? []
          : [
              {
                area: "method",
                message: "The sauce needs a reliable thickening step.",
                blocking: true,
              },
            ],
        content: authored
          ? {
              ...proposal.content,
              description: "A saved improvement awaiting culinary review.",
            }
          : proposal.content,
        latestRun: {
          _id: "failed-run" as Id<"catalogueGenerationRuns">,
          _creationTime: 1,
          operation: "improve",
          trigger: "manual",
          actor: "admin",
          requestKey: "failed",
          proposalId: proposal._id,
          expectedRevision: proposal.revision,
          status: "failed",
          phase: "complete",
          active: false,
          attemptToken: "failed",
          deadline: 300000,
          config: generationConfig,
          createdAt: 1,
          updatedAt: 90007,
          checkpointStage: authored ? "authored" : "original_review",
          feedback: args.feedback as string | undefined,
          failure:
            "Invalid error response format: Gateway request failed: The operation was aborted due to timeout",
          usage: [
            {
              role: authored ? "culinary_review" : "authoring",
              durationMs: 90006,
              outcome: "failed",
              requestedModel: generationConfig.textModel,
              resolvedModel: generationConfig.textModel,
            },
          ],
        },
      };
    }
    if (name === "begin" && args.operation === "improve" && proposal)
      proposal = {
        ...proposal,
        revision: proposal.revision + 1,
        reviewedRevision: proposal.revision + 1,
        maintenanceMode: "recipe",
        findings: [],
        latestRun: undefined,
        initialPrompt: String(args.feedback ?? ""),
        changeSummary: ["Applied the requested improvement."],
      };
    if (name === "begin" && args.operation === "enrich")
      metadata = {
        _id: "metadata-one" as Id<"catalogueAnalysisMetadata">,
        _creationTime: 1,
        catalogueMealId: "existing",
        catalogueVersion: 1,
        fingerprint: "fixture",
        status: "proposed",
        createdAt: 1,
        tags: {
          cuisines: ["mediterranean"],
          mealOccasion: "dinner",
          cookingMethods: ["simmered"],
          proteinSource: "chickpeas",
          carbBase: "rice",
          flavourProfile: ["lemon"],
          complexity: "simple",
          vegetarian: "yes",
          vegan: "yes",
        },
      };
    if (name === "reviewMetadata" && metadata)
      metadata = { ...metadata, status: "reviewed" };
    if (name === "updateProposal" && proposal)
      proposal = {
        ...proposal,
        content: prepareRecipeContent(args.content as typeof content),
        tags: args.tags as NonNullable<typeof proposal>["tags"],
        revision: proposal.revision + 1,
        reviewedRevision:
          proposal.reviewedRevision === proposal.revision &&
          !culinaryContentChanged(
            proposal.content,
            args.content as typeof content,
          )
            ? proposal.revision + 1
            : undefined,
        status: "pending_review",
        imageUrl: null,
      };
    if (name === "begin" && args.operation === "review" && proposal)
      proposal = {
        ...proposal,
        reviewedRevision: proposal.revision,
        latestRun: undefined,
        findings: [],
      };
    if (name === "begin" && args.operation === "image" && proposal)
      proposal = {
        ...proposal,
        status: "image_review",
        photoGuidance: String(args.feedback ?? ""),
        imageUrl:
          "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=",
      };
    if (name === "publish" && proposal) {
      if (proposal.sourceMealId)
        published = {
          ...published,
          ...proposal.content,
          version: published.version + 1,
        };
      proposal = { ...proposal, status: "published" };
    }
    if (name === "reject" && proposal)
      proposal = {
        ...proposal,
        status: "rejected",
        rejectionReason: String(args.reason),
      };
    if (name === "deleteProposal") {
      proposals.delete(String(args.proposalId));
      proposal = null;
    }
    if (proposal) proposals.set(proposal._id, proposal);
    changed();
    if (name === "start" && proposal)
      return { proposalId: proposal._id, runId: "fixture-run", reused: false };
    return name === "updateProposal" ? proposal?.revision : "fixture-run";
  };
}
