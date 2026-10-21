"use client";
import { useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { AdminAccess } from "./admin-access";
import { AdminSections } from "./admin-sections";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { ProposalEditor } from "./proposal-editor";
import { generationRunSummary } from "@/lib/domain/catalogue-generation";
import { adminInputClass } from "./editorial-tags-editor";
import { CatalogueAnalysisEditor } from "./catalogue-analysis-editor";
import { adminContainerClass } from "./admin-layout";
import { needsProposalReview, proposalStatusLabels } from "./proposal-types";
import { GenerationRunHistory } from "./generation-run-history";

export function AdminRecipes() {
  return (
    <AdminAccess>
      <AdminWorkspace />
    </AdminAccess>
  );
}
function AdminWorkspace() {
  const overview = useQuery(api.catalogueAdmin.overview, {});
  const begin = useMutation(api.catalogueAdmin.begin);
  const [selection, setSelection] = useState<Id<"catalogueProposals"> | null>(
    null,
  );
  const proposal = useQuery(
    api.catalogueAdmin.getProposal,
    selection ? { proposalId: selection } : "skip",
  );
  const [busy, setBusy] = useState(false);
  const pendingRef = useRef(false);
  const [message, setMessage] = useState<{
    error: boolean;
    text: string;
  } | null>(null);
  const [initialPrompt, setInitialPrompt] = useState("");
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [queueFilter, setQueueFilter] = useState<"review" | "history">(
    "review",
  );
  function selectProposal(id: Id<"catalogueProposals">) {
    if (selection === id) return;
    if (
      dirty &&
      !window.confirm("Discard your unsaved changes and open another proposal?")
    )
      return;
    setDirty(false);
    setSelection(id);
  }
  const visibleProposals = overview?.proposals.filter(
    (proposal) =>
      needsProposalReview(proposal.status) === (queueFilter === "review"),
  );
  const reviewCount =
    overview?.proposals.filter((proposal) =>
      needsProposalReview(proposal.status),
    ).length ?? 0;
  async function perform(job: () => Promise<unknown>, success: string) {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setBusy(true);
    setMessage(null);
    try {
      await job();
      setMessage({ error: false, text: success });
    } catch (error) {
      setMessage({
        error: true,
        text:
          error instanceof Error
            ? error.message
            : "The operation failed. Please retry.",
      });
    } finally {
      pendingRef.current = false;
      setBusy(false);
    }
  }
  const running = busy || Boolean(overview?.activeRun);
  const latestRun = overview?.runs[0];
  return (
    <main className={`${adminContainerClass} py-8 text-ink`}>
      <Link
        href="/recipes"
        className="mb-4 inline-flex min-h-11 items-center text-sm font-semibold text-graphite underline underline-offset-4"
      >
        Back to Foodedo
      </Link>
      <AdminSections active="proposals" />
      <header className="mb-8 border-b-2 border-ink pb-6">
        <p className="text-xs font-bold tracking-widest text-cadmium uppercase">
          Foodedo · Editorial
        </p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-5">
          <div>
            <h1 className="font-display text-4xl">Recipe editorial</h1>
            <p className="mt-3 max-w-xl text-graphite">
              One considered recipe at a time. Every recipe and photograph needs
              your approval before it reaches the catalogue.
            </p>
          </div>
        </div>
        <form
          id="new-catalogue-recipe"
          className="mt-6 grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            if (running || !overview) return;
            void perform(
              () =>
                begin({
                  operation: "generate",
                  requestKey: crypto.randomUUID(),
                  ...(initialPrompt.trim()
                    ? { initialPrompt: initialPrompt.trim() }
                    : {}),
                }),
              initialPrompt.trim()
                ? "Your requested recipe is being developed. It will still receive culinary review before approval."
                : "Generation started. Your proposal will appear in the review queue.",
            );
          }}
        >
          <div className="space-y-2">
            <label
              htmlFor="recipe-request"
              className="block text-sm font-semibold"
            >
              Recipe request (optional)
            </label>
            <textarea
              id="recipe-request"
              className={`${adminInputClass} min-h-24`}
              rows={2}
              value={initialPrompt}
              maxLength={2000}
              disabled={running}
              onChange={(event) => setInitialPrompt(event.target.value)}
              placeholder="Can you generate me a rustic shepherd’s pie recipe?"
              aria-describedby="recipe-request-help"
            />
            <p id="recipe-request-help" className="text-sm text-graphite">
              Ask for a specific dish, or leave blank for a catalogue
              suggestion. Requests go straight to recipe development.
            </p>
          </div>
          <Button
            type="submit"
            disabled={running || !overview}
            aria-busy={Boolean(overview?.activeRun)}
          >
            {overview?.activeRun
              ? "Generation in progress…"
              : "Trigger new recipe"}
          </Button>
        </form>
      </header>
      {message ? (
        <p
          role={message.error ? "alert" : "status"}
          className={`mb-5 border-l-4 p-4 ${message.error ? "border-cadmium bg-mist" : "border-leaf bg-mist"}`}
        >
          {message.text}
        </p>
      ) : null}
      {overview?.activeRun ? (
        <p role="status" className="mb-5 bg-mist p-4">
          {(
            {
              selection: "Choosing a catalogue gap",
              authoring: "Writing the recipe",
              improve: "Reviewing and improving the recipe",
              culinary_review: "Checking cooking quality",
              targeted_repair: "Refining the recipe",
              photography: "Generating food photography",
              enrichment: "Suggesting catalogue tags",
            } as Record<string, string>
          )[overview.activeRun.phase] ??
            `Working: ${overview.activeRun.phase.replaceAll("_", " ")}`}
          . You can leave this page and return; the run continues in the
          background.
        </p>
      ) : null}
      {!overview?.activeRun &&
      latestRun &&
      (latestRun.status === "failed" || latestRun.status === "timed_out") ? (
        <p role="alert" className="mb-5 border-l-4 border-cadmium bg-mist p-4">
          Latest {latestRun.operation} run failed:{" "}
          {latestRun.failure ?? "Please inspect recent runs before retrying."}
        </p>
      ) : null}
      {!overview?.activeRun && latestRun?.status === "succeeded" ? (
        <div
          role="status"
          className="mb-5 flex flex-wrap items-center gap-3 border-l-4 border-leaf bg-mist p-4"
        >
          <p>
            Latest {latestRun.operation} run completed successfully.{" "}
            {generationRunSummary(latestRun)}
          </p>
          {latestRun.proposalId ? (
            <Button
              variant="secondary"
              onClick={() => {
                selectProposal(latestRun.proposalId!);
              }}
            >
              Open proposal
            </Button>
          ) : null}
        </div>
      ) : null}
      {overview ? (
        <p className="mb-6 text-sm text-graphite">
          {overview.statistics.total} published meals and active proposals ·
          publication requires your approval
        </p>
      ) : (
        <p role="status">Loading editorial workspace…</p>
      )}
      <div className="grid items-start gap-8 md:grid-cols-[15rem_minmax(0,1fr)]">
        <aside
          aria-label="Recipe proposal queue"
          className="min-w-0 md:sticky md:top-20"
        >
          <h2 className="mb-3 font-display text-xl">Review queue</h2>
          <div
            className="mb-3 flex gap-2"
            role="group"
            aria-label="Filter proposals"
          >
            <Button
              variant="secondary"
              className="min-w-0 flex-1 px-2 text-sm aria-pressed:border-ink aria-pressed:bg-mist"
              aria-pressed={queueFilter === "review"}
              onClick={() => setQueueFilter("review")}
            >
              To review ({reviewCount})
            </Button>
            <Button
              variant="secondary"
              className="min-w-0 flex-1 px-2 text-sm aria-pressed:border-ink aria-pressed:bg-mist"
              aria-pressed={queueFilter === "history"}
              onClick={() => setQueueFilter("history")}
            >
              History
            </Button>
          </div>
          <p className="mb-3 text-xs text-graphite">
            {queueFilter === "review"
              ? "Recipes awaiting recipe or photograph approval."
              : "Published, rejected and replaced proposals. Shows the most recent 200 proposals."}
          </p>
          {overview && visibleProposals?.length === 0 ? (
            <p className="text-sm text-graphite">
              {queueFilter === "review"
                ? "Nothing awaiting review. Start with “Trigger new recipe”."
                : "No completed proposals yet."}
            </p>
          ) : null}
          <ul className="max-h-64 divide-y divide-border overflow-y-auto md:max-h-[calc(100dvh-18rem)]">
            {visibleProposals?.map((p) => (
              <li key={p._id}>
                <button
                  className={`min-h-16 w-full border-l-2 px-3 py-4 text-left focus-visible:outline-2 focus-visible:outline-cadmium ${selection === p._id ? "border-cadmium bg-mist" : "border-transparent"}`}
                  onClick={() => selectProposal(p._id)}
                  aria-pressed={selection === p._id}
                >
                  <span className="block font-semibold">{p.title}</span>
                  <span className="mt-1 block text-xs text-graphite">
                    {proposalStatusLabels[p.status]}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>
        <div className="min-w-0">
          {proposal ? (
            <ProposalEditor
              key={proposal._id}
              proposal={proposal}
              busy={running}
              perform={perform}
              onDirtyChange={setDirty}
            />
          ) : (
            <p className="border-t-2 border-ink py-6 text-graphite">
              {selection && proposal === undefined
                ? "Loading proposal…"
                : "Select a proposal to preview and review."}
            </p>
          )}
        </div>
      </div>
      <details
        className="mt-10 border-t border-border pt-4"
        onToggle={(event) => setAnalysisOpen(event.currentTarget.open)}
      >
        <summary className="min-h-11 cursor-pointer py-3 font-semibold">
          Optional: improve catalogue suggestions
        </summary>
        <p className="mb-4 max-w-2xl text-sm text-graphite">
          Add cuisine and cooking-method tags to existing recipes so automatic
          suggestions can spot more gaps. This is optional housekeeping;
          generating a recipe never depends on completing it.
        </p>
        {analysisOpen ? (
          <CatalogueAnalysisEditor
            busy={running}
            enriching={overview?.activeRun?.operation === "enrich"}
            perform={perform}
          />
        ) : null}
      </details>
      <GenerationRunHistory runs={overview?.runs ?? []} />
    </main>
  );
}
