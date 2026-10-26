"use client";
import { filterCatalogueMealsBySearch } from "@/lib/domain/recipe-search";
import { formatRecipeHeading } from "@/lib/domain/recipe-headings";
import { useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import Image from "next/image";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { AdminAccess } from "./admin-access";
import { AdminSections } from "./admin-sections";
import { adminContainerClass } from "./admin-layout";
import { adminInputClass } from "./editorial-tags-editor";
import { ProposalPreview } from "./proposal-preview";
import { ProposalEditor } from "./proposal-editor";
import { PhotographGuidanceField } from "./photograph-guidance-field";

export function CatalogueMaintenance() {
  return (
    <AdminAccess title="Catalogue maintenance">
      <MaintenanceWorkspace />
    </AdminAccess>
  );
}
function MaintenanceWorkspace() {
  const catalogue = useQuery(api.catalogueMaintenance.list, {});
  const [selection, setSelection] = useState<Id<"catalogueMeals"> | null>(null);
  const meal = useQuery(
    api.catalogueMaintenance.getMeal,
    selection ? { mealId: selection } : "skip",
  );
  const [proposalId, setProposalId] = useState<Id<"catalogueProposals"> | null>(
    null,
  );
  const proposal = useQuery(
    api.catalogueAdmin.getProposal,
    proposalId ? { proposalId } : "skip",
  );
  const [search, setSearch] = useState("");
  const [feedback, setFeedback] = useState("");
  const [photoGuidance, setPhotoGuidance] = useState("");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(
    null,
  );
  const start = useMutation(api.catalogueMaintenance.start);
  async function perform(job: () => Promise<unknown>, success: string) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setNotice(null);
    try {
      await job();
      setNotice({ error: false, text: success });
    } catch (error) {
      setNotice({
        error: true,
        text:
          error instanceof Error
            ? error.message
            : "The task failed. Please retry.",
      });
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  function mayLeaveDraft() {
    return !dirty || window.confirm("Discard your unsaved recipe changes?");
  }
  function select(id: Id<"catalogueMeals">) {
    if (id === selection && !proposalId) return;
    if (!mayLeaveDraft()) return;
    setSelection(id);
    setProposalId(null);
    setFeedback("");
    setPhotoGuidance("");
    setNotice(null);
    setDirty(false);
  }
  const running = busy || Boolean(catalogue?.activeRun);
  const matches = catalogue
    ? filterCatalogueMealsBySearch(catalogue.meals, search)
    : undefined;
  async function begin(mode: "recipe" | "image") {
    if (!meal || running) return;
    let reused = false;
    const request = (mode === "image" ? photoGuidance : feedback).trim();
    await perform(async () => {
      const result = await start({
        mealId: meal.mealId,
        mode,
        requestKey: crypto.randomUUID(),
        ...(request ? { feedback: request } : {}),
      });
      setProposalId(result.proposalId);
      reused = result.reused;
    }, "Maintenance draft opened. The published recipe stays unchanged until you approve publication.");
    if (reused)
      setNotice({
        error: false,
        text:
          mode === "image"
            ? "An existing maintenance draft was opened. Your new request was not submitted; use Photo guidance when generating or regenerating its photograph."
            : "An existing maintenance draft was opened. Your new request was not submitted; review the draft or add guidance under More actions.",
      });
  }
  return (
    <main className={`${adminContainerClass} py-8 text-ink`}>
      <Link
        href="/recipes"
        className="mb-4 inline-flex min-h-11 items-center text-sm font-semibold text-graphite underline underline-offset-4"
      >
        Back to Foodedo
      </Link>
      <AdminSections active="catalogue" />
      <header className="mb-8 border-b-2 border-ink pb-6">
        <p className="text-xs font-bold tracking-widest text-cadmium uppercase">
          Foodedo · Editorial
        </p>
        <h1 className="mt-3 font-display text-4xl">Catalogue maintenance</h1>
        <p className="mt-3 max-w-2xl text-graphite">
          Improve any published recipe or replace its photograph. Changes stay
          private until you review and publish a new revision. Saved recipes and
          existing plans keep their original snapshots.
        </p>
      </header>
      {notice ? (
        <p
          role={notice.error ? "alert" : "status"}
          className={`mb-5 border-l-4 bg-mist p-4 ${notice.error ? "border-cadmium" : "border-leaf"}`}
        >
          {notice.text}
        </p>
      ) : null}
      {catalogue?.activeRun ? (
        <p role="status" className="mb-5 bg-mist p-4">
          An editorial task is running:{" "}
          {catalogue.activeRun.phase.replaceAll("_", " ")}. It continues if you
          leave this page. New paid tasks are available when it finishes.
        </p>
      ) : null}
      <div className="grid items-start gap-8 md:grid-cols-[15rem_minmax(0,1fr)]">
        <aside
          aria-label="Published catalogue recipes"
          className="min-w-0 md:sticky md:top-20"
        >
          <label className="block text-sm font-semibold">
            Find a catalogue recipe
            <input
              type="search"
              className={`${adminInputClass} mt-2`}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <p className="my-3 text-xs text-graphite">
            {catalogue
              ? `${matches?.length ?? 0} of ${catalogue.meals.length} recipes`
              : "Loading catalogue…"}
          </p>
          <ul className="max-h-64 divide-y divide-border overflow-y-auto md:max-h-[calc(100dvh-18rem)]">
            {matches?.map((row) => (
              <li key={row._id}>
                <button
                  className={`min-h-16 w-full border-l-2 px-3 py-4 text-left focus-visible:outline-2 focus-visible:outline-cadmium ${row._id === selection ? "border-cadmium bg-mist" : "border-transparent"}`}
                  onClick={() => select(row._id)}
                  aria-pressed={row._id === selection}
                >
                  <span className="block font-semibold">
                    {formatRecipeHeading(row.title)}
                  </span>
                  <span className="mt-1 block text-xs text-graphite">
                    Published · revision {row.version}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {catalogue && !matches?.length ? (
            <p className="text-sm text-graphite">
              No recipes match your search.
            </p>
          ) : null}
        </aside>
        <div className="min-w-0">
          {proposalId ? (
            <>
              <Button
                variant="secondary"
                className="mb-4"
                onClick={() => {
                  if (mayLeaveDraft()) {
                    if (proposal?.publishedMealId)
                      setSelection(proposal.publishedMealId);
                    setProposalId(null);
                    setDirty(false);
                  }
                }}
              >
                Back to published recipe
              </Button>
              {proposal ? (
                <ProposalEditor
                  key={proposal._id}
                  proposal={proposal}
                  busy={running}
                  perform={perform}
                  onDirtyChange={setDirty}
                  initialPhotoGuidance={photoGuidance.trim() || undefined}
                />
              ) : (
                <p role="status">
                  {proposal === null
                    ? "This draft was deleted. Return to the published recipe to start again."
                    : "Loading maintenance draft…"}
                </p>
              )}
            </>
          ) : meal ? (
            <section
              className="border-t-2 border-ink pt-5"
              aria-label="Published recipe maintenance"
            >
              <p className="text-xs font-bold tracking-widest text-cadmium uppercase">
                Published · revision {meal.version}
              </p>
              <h2 className="mt-2 font-display text-3xl">
                {formatRecipeHeading(meal.content.title)}
              </h2>
              <div className="my-5 space-y-3 rounded-compact border border-border bg-mist p-4">
                <h3 className="font-semibold">
                  Review and improve this recipe
                </h3>
                <label className="block text-sm font-semibold">
                  Recipe improvement request (optional)
                  <textarea
                    rows={3}
                    maxLength={2000}
                    className={`${adminInputClass} mt-2`}
                    value={feedback}
                    disabled={running}
                    onChange={(event) => setFeedback(event.target.value)}
                    placeholder="Use a roux to give the sauce a more reliable consistency."
                  />
                </label>
                <p className="text-sm text-graphite">
                  Leave blank for a critical culinary pass, or describe a
                  specific change. The AI reviews the original, makes justified
                  improvements, then checks the result. Uses paid AI calls.
                </p>
                <Button
                  className="h-auto min-h-12 max-w-full px-3 py-3 text-center leading-snug"
                  disabled={running}
                  onClick={() => begin("recipe")}
                >
                  Review and improve recipe
                </Button>
              </div>
              <details className="mb-5 border-y border-border">
                <summary className="min-h-11 cursor-pointer py-3 font-semibold">
                  Replace the photograph only
                </summary>
                <p className="mb-3 text-sm text-graphite">
                  Generate a new photograph using the current photography model
                  and style. Recipe text stays exactly as published, with no
                  text generation charges. You review the new image before it
                  replaces this one.
                </p>
                <div className="mb-4">
                  <PhotographGuidanceField
                    value={photoGuidance}
                    onChange={setPhotoGuidance}
                    disabled={running}
                  />
                </div>
                <Button
                  variant="secondary"
                  className="mb-4 h-auto min-h-12 max-w-full px-3 py-3"
                  disabled={running}
                  onClick={() => begin("image")}
                >
                  Generate replacement photograph
                </Button>
              </details>
              {meal.imageUrl ? (
                <Image
                  src={meal.imageUrl}
                  alt={`Current photograph of ${formatRecipeHeading(meal.content.title)}`}
                  width={1536}
                  height={864}
                  unoptimized
                  className="mb-5 aspect-video w-full rounded-compact object-cover"
                />
              ) : null}
              <ProposalPreview content={meal.content} />
            </section>
          ) : (
            <p className="border-t-2 border-ink py-6 text-graphite">
              {selection && meal === undefined
                ? "Loading published recipe…"
                : selection
                  ? "This revision is no longer current. Select its latest version from the list."
                  : "Select a published recipe to review it or replace its photograph."}
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
