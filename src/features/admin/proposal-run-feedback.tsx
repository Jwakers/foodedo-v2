import { Button } from "@/components/ui/button";
import type { Proposal } from "./proposal-types";

function failureDescription(run: NonNullable<Proposal["latestRun"]>) {
  // Older Gateway errors hid the useful timeout detail behind an SDK wrapper.
  if (
    run.failure?.startsWith("Invalid error response format:") &&
    /timeout|timed.out/i.test(run.failure)
  ) {
    const step = [...run.usage]
      .reverse()
      .find((event) => event.outcome !== "succeeded");
    const label =
      step?.role === "authoring"
        ? "Recipe writing"
        : step?.role === "culinary_review"
          ? "Culinary review"
          : "Recipe processing";
    return `${label} timed out${step ? ` after ${Math.round(step.durationMs / 1000)} seconds` : ""}.`;
  }
  return run.failure ?? "The task could not be completed.";
}

export function ProposalRunFeedback({
  proposal,
  busy,
  onRetry,
}: {
  proposal: Proposal;
  busy: boolean;
  onRetry: () => void;
}) {
  const run = proposal.latestRun;
  if (!run || !["failed", "timed_out"].includes(run.status)) return null;
  const isImprovement = run.operation === "improve";
  return (
    <section
      role="alert"
      className="mt-3 space-y-3 border-l-4 border-cadmium bg-mist p-4 text-sm"
    >
      <p>
        <strong>The last {run.operation} task failed.</strong>{" "}
        {failureDescription(run)} No changes were published.
      </p>
      {isImprovement ? (
        <p>
          {run.checkpointStage === "authored"
            ? "Written changes and available findings are saved in this private draft. Run culinary review before approving; only retry the improvement if you want to rewrite it again."
            : run.checkpointStage === "original_review"
              ? "The completed critical review is saved below. The rewrite did not finish; retry to develop the improvements."
              : "No completed review or rewrite was saved for this attempt. Your original recipe and guidance are retained."}
        </p>
      ) : (
        <p>The current draft is retained for review or retry.</p>
      )}
      {isImprovement &&
      ["pending_review", "image_review"].includes(proposal.status) ? (
        <>
          <Button variant="secondary" disabled={busy} onClick={onRetry}>
            Retry improvement
          </Button>
          <p>
            Uses the previous request on this saved draft. This starts paid AI
            work; retries never run automatically.
          </p>
        </>
      ) : null}
    </section>
  );
}
