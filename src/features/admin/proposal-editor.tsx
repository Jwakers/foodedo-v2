"use client";
import { formatRecipeHeading } from "@/lib/domain/recipe-headings";
import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import Image from "next/image";
import { api } from "../../../convex/_generated/api";
import { culinaryContentChanged } from "@/lib/domain/catalogue-generation";
import { Button } from "@/components/ui/button";
import { EditorField } from "@/features/recipes/recipe-editor-fields";
import {
  ProposalStages,
  ProposalChanges,
  ProposalHistory,
} from "./proposal-context";
import { ProposalRunFeedback } from "./proposal-run-feedback";
import { ProposalContentEditor } from "./proposal-content-editor";
import { ProposalPreview } from "./proposal-preview";
import { PhotographGuidanceField } from "./photograph-guidance-field";
import {
  getReviewGuidance,
  proposalStatusLabels,
  type Proposal,
} from "./proposal-types";

export function ProposalEditor({
  proposal: p,
  busy,
  perform,
  onDirtyChange,
  initialPhotoGuidance,
}: {
  proposal: Proposal;
  busy: boolean;
  perform: (job: () => Promise<unknown>, success: string) => Promise<void>;
  onDirtyChange: (dirty: boolean) => void;
  initialPhotoGuidance?: string;
}) {
  // Keep the editing baseline separate from reactive server data so another
  // administrator's save never silently replaces an unsaved local draft.
  const [baseline, setBaseline] = useState(p);
  const [content, setContent] = useState(p.content);
  const [tags, setTags] = useState(p.tags);
  const [editing, setEditing] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [photoGuidance, setPhotoGuidance] = useState(
    initialPhotoGuidance ??
      p.photoGuidance ??
      (p.latestRun?.operation === "image" ? (p.latestRun.feedback ?? "") : ""),
  );
  const [reason, setReason] = useState("");
  const update = useMutation(api.catalogueAdmin.updateProposal);
  const begin = useMutation(api.catalogueAdmin.begin);
  const reject = useMutation(api.catalogueAdmin.reject);
  const remove = useMutation(api.catalogueAdmin.deleteProposal);
  const publish = useMutation(api.catalogueAdmin.publish);
  const dirty =
    JSON.stringify(content) !== JSON.stringify(baseline.content) ||
    JSON.stringify(tags) !== JSON.stringify(baseline.tags);
  const conflict = p.revision > baseline.revision && dirty;
  if (p.revision > baseline.revision && !dirty) {
    setBaseline(p);
    setContent(p.content);
    setTags(p.tags);
  }
  useEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    document.getElementById("selected-proposal")?.focus();
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const guardLink = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        !(event.target instanceof Element)
      )
        return;
      const link = event.target.closest("a[href]");
      if (
        !(link instanceof HTMLAnchorElement) ||
        link.target === "_blank" ||
        link.hasAttribute("download")
      )
        return;
      const destination = new URL(link.href);
      if (
        destination.origin === location.origin &&
        destination.pathname === location.pathname &&
        destination.search === location.search
      )
        return;
      if (
        !window.confirm(
          "Discard your unsaved recipe changes and leave this page?",
        )
      ) {
        event.preventDefault();
        event.stopPropagation();
      } else {
        window.removeEventListener("beforeunload", warn);
      }
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", guardLink, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", guardLink, true);
    };
  }, [dirty]);
  const editable = p.status === "pending_review" || p.status === "image_review";
  const sourceStale = Boolean(
    p.sourceMealId && p.sourceMeal?.status !== "published",
  );
  const reviewed = p.reviewedRevision === p.revision;
  const blocked = p.findings.some((finding) => finding.blocking);
  const ready = reviewed && !blocked;
  const guidance = getReviewGuidance(p, editing);
  function operation(operation: "regenerate" | "review" | "image" | "improve") {
    const request =
      operation === "image"
        ? photoGuidance.trim()
        : operation === "regenerate" || operation === "improve"
          ? feedback.trim()
          : "";
    return perform(
      () =>
        begin({
          operation,
          requestKey: crypto.randomUUID(),
          proposalId: p._id,
          expectedRevision: p.revision,
          ...(request ? { feedback: request } : {}),
        }),
      operation === "image"
        ? "Photography started. The image will need your approval before publication."
        : operation === "review"
          ? "Culinary review started. It checks the saved recipe without changing it."
          : operation === "improve"
            ? "Recipe improvement started. The published recipe remains unchanged."
            : "Replacement started. This proposal is kept until its replacement succeeds.",
    );
  }
  function discard() {
    if (dirty && !window.confirm("Discard your unsaved recipe changes?"))
      return;
    setBaseline(p);
    setContent(p.content);
    setTags(p.tags);
    setEditing(false);
  }
  return (
    <article
      className="min-w-0 scroll-mt-20 border-t-2 border-ink pt-5"
      id="selected-proposal"
      tabIndex={-1}
    >
      <p className="text-xs font-bold tracking-widest text-cadmium uppercase">
        {proposalStatusLabels[p.status]} · Revision {p.revision}
      </p>
      <h2 className="mt-2 font-display text-3xl">
        {formatRecipeHeading(p.content.title)}
      </h2>
      <ProposalRunFeedback
        proposal={p}
        busy={busy || dirty || sourceStale}
        onRetry={() =>
          void perform(
            () =>
              begin({
                operation: "improve",
                requestKey: crypto.randomUUID(),
                proposalId: p._id,
                expectedRevision: p.revision,
                ...(p.latestRun?.feedback
                  ? { feedback: p.latestRun.feedback }
                  : {}),
              }),
            "Improvement restarted using the previous request. Completed progress will be saved privately.",
          )
        }
      />
      {p.sourceMealId ? (
        <p className="mt-3 text-sm text-graphite">
          Catalogue update · source revision{" "}
          {p.sourceMeal?.version ?? "unavailable"}. Publishing replaces the
          current catalogue revision; existing saved copies stay unchanged.
        </p>
      ) : null}
      {editable && p.sourceMealId && p.sourceMeal?.status !== "published" ? (
        <p
          role="alert"
          className="mt-3 border-l-4 border-cadmium bg-mist p-3 text-sm"
        >
          The catalogue has a newer revision. This draft can no longer publish;
          reject or delete it and start from the current recipe in Catalogue
          maintenance.
        </p>
      ) : null}
      <ProposalStages proposal={p} />
      <ProposalChanges proposal={p} />
      {!editable && dirty ? (
        <div
          role="alert"
          className="mb-5 space-y-3 border-l-4 border-cadmium bg-mist p-4 text-sm"
        >
          <p>
            This proposal changed while you were editing and is now read-only.
            Your unsaved draft is preserved until you discard it.
          </p>
          <Button variant="secondary" onClick={discard}>
            Discard changes and load latest
          </Button>
        </div>
      ) : null}
      {editable ? (
        <section
          id="proposal-actions"
          aria-label="Review actions"
          className="mb-6 scroll-mt-20 space-y-3 rounded-compact border border-border bg-mist p-4"
        >
          <h3 className="font-semibold">{guidance.heading}</h3>
          {!editing && !p.imageUrl && ready ? (
            <PhotographGuidanceField
              value={photoGuidance}
              onChange={setPhotoGuidance}
              disabled={busy || dirty || sourceStale}
            />
          ) : null}
          <p className="text-sm text-graphite">{guidance.description}</p>
          {conflict ? (
            <p role="alert" className="text-sm text-cadmium">
              Another administrator saved a newer revision. Your edits are
              preserved here; discard them to load the latest recipe before
              continuing.
            </p>
          ) : null}
          {dirty ? (
            <p role="status" className="text-sm font-semibold">
              Unsaved changes — save or discard before reviewing or approving.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-3">
            {editing ? (
              <>
                <Button
                  disabled={busy || !dirty || conflict || sourceStale}
                  onClick={() =>
                    perform(
                      async () => {
                        const revision = await update({
                          proposalId: p._id,
                          revision: baseline.revision,
                          content,
                          tags,
                        });
                        setBaseline({ ...p, revision, content, tags });
                        setEditing(false);
                      },
                      p.reviewedRevision === p.revision &&
                        !culinaryContentChanged(p.content, content)
                        ? "Changes saved. Culinary review retained."
                        : "Changes saved. Run culinary review before approving.",
                    )
                  }
                >
                  Save changes
                </Button>
                <Button variant="secondary" disabled={busy} onClick={discard}>
                  {dirty ? "Discard changes" : "Close editor"}
                </Button>
              </>
            ) : (
              <>
                {!reviewed ? (
                  <Button
                    disabled={busy || dirty}
                    onClick={() => operation("review")}
                  >
                    Run culinary review
                  </Button>
                ) : null}
                {p.status === "image_review" ? (
                  <Button
                    className="h-auto min-h-12 max-w-full px-3 py-3 text-center leading-snug"
                    disabled={
                      busy || dirty || !ready || !p.imageUrl || sourceStale
                    }
                    onClick={() =>
                      perform(
                        () =>
                          publish({ proposalId: p._id, revision: p.revision }),
                        "Recipe published to the catalogue.",
                      )
                    }
                  >
                    Approve image and publish
                  </Button>
                ) : (
                  <Button
                    className="h-auto min-h-12 max-w-full px-3 py-3 text-center leading-snug"
                    disabled={busy || dirty || !ready || sourceStale}
                    onClick={() => operation("image")}
                  >
                    {p.maintenanceMode === "image"
                      ? "Generate replacement photograph"
                      : "Approve recipe and generate image"}
                  </Button>
                )}
                <Button
                  variant={blocked ? "primary" : "secondary"}
                  disabled={busy || sourceStale}
                  onClick={() => setEditing(true)}
                >
                  Edit recipe
                </Button>
              </>
            )}
          </div>
        </section>
      ) : (
        <p className="mb-5 rounded-compact bg-mist p-4 text-sm">
          {p.status === "published"
            ? "Published to the catalogue. This approved revision is read-only."
            : p.status === "generating_image"
              ? "The approved recipe is frozen while its photograph is generated. Return here to review it when ready."
              : p.status === "superseded"
                ? "A replacement was generated successfully. This proposal can no longer be published."
                : `Proposal rejected${p.rejectionReason ? `: ${p.rejectionReason}` : "."}`}
        </p>
      )}
      {p.maintenanceMode === "image" ? (
        <p className="mb-5 border-l-4 border-leaf bg-mist p-4 text-sm">
          <strong>Published recipe retained.</strong> This is a photograph-only
          update. The text is unchanged, so no new culinary AI review was run.
        </p>
      ) : (
        <section
          aria-label="Culinary review"
          className={`mb-5 border-l-4 bg-mist p-4 ${blocked ? "border-cadmium" : ready ? "border-leaf" : "border-border"}`}
        >
          <h3 className="font-semibold">
            {blocked
              ? "Culinary review: changes needed"
              : !reviewed
                ? "Culinary review needed"
                : "Culinary review passed"}
          </h3>
          <p className="mt-1 text-sm">
            {blocked
              ? "Blocking findings must be resolved before approval."
              : !reviewed
                ? "A successful culinary review of the current saved draft is required before approval."
                : "The saved recipe has passed the automated checks. Your judgement is still needed before approval."}
          </p>
          {p.findings.length ? (
            <details
              className="mt-2"
              open={
                blocked ||
                (p.latestRun?.checkpointStage === "original_review" &&
                  !p.latestRun.active)
              }
            >
              <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">
                Review findings ({p.findings.length})
              </summary>
              <ul className="list-disc space-y-2 pl-5 text-sm">
                {p.findings.map((finding, index) => (
                  <li key={index}>
                    <strong>
                      {finding.blocking ? "Blocking" : "Suggestion"} ·{" "}
                      {finding.area}:
                    </strong>{" "}
                    {finding.message}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </section>
      )}
      {p.imageUrl ? (
        <figure className="mb-6">
          <Image
            src={p.imageUrl}
            alt={`Generated photograph of ${formatRecipeHeading(p.content.title)}`}
            width={1536}
            height={864}
            unoptimized
            className="aspect-video w-full rounded-compact object-cover"
          />
          <figcaption className="mt-2 text-sm text-graphite">
            Check ingredients, sides, garnishes and cooked appearance against
            the approved recipe.
          </figcaption>
          {editable && !editing ? (
            <div className="mt-3 space-y-3">
              <PhotographGuidanceField
                value={photoGuidance}
                onChange={setPhotoGuidance}
                disabled={busy || dirty || !ready || sourceStale}
              />
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant="secondary"
                  disabled={busy || dirty || !ready || sourceStale}
                  onClick={() => operation("image")}
                >
                  Regenerate image
                </Button>
                <p className="text-sm text-graphite">
                  Creates a new paid photograph for this recipe only.
                </p>
              </div>
            </div>
          ) : null}
        </figure>
      ) : null}
      {editing ? (
        <ProposalContentEditor
          content={content}
          setContent={setContent}
          tags={tags}
          setTags={setTags}
          disabled={busy || !editable || conflict}
        />
      ) : (
        <ProposalPreview content={p.content} />
      )}
      <ProposalHistory proposal={p} />
      {editable ? (
        <a
          href="#proposal-actions"
          className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-cadmium underline underline-offset-4"
        >
          Back to {editing ? "save controls" : "review actions"}
        </a>
      ) : null}
      {p.status !== "published" && p.status !== "generating_image" ? (
        <details className="border-t border-border">
          <summary className="min-h-11 cursor-pointer py-3 font-semibold">
            More actions
          </summary>
          {editable ? (
            <div className="space-y-5 pb-5">
              <div className="space-y-2">
                <EditorField
                  label={
                    p.sourceMealId
                      ? "Recipe improvement request (optional)"
                      : "Guidance for a replacement recipe (optional)"
                  }
                  multiline
                  value={feedback}
                  onChange={setFeedback}
                />
                <p className="text-sm text-graphite">
                  {p.sourceMealId
                    ? "Reviews and improves the saved draft using your guidance. The live catalogue recipe stays unchanged. Uses paid AI calls."
                    : "Develops the same concept again. The original stays available until a replacement succeeds. Uses paid AI calls."}
                </p>
                {p.sourceMealId ? (
                  <Button
                    variant="secondary"
                    disabled={busy || dirty}
                    onClick={() => operation("improve")}
                  >
                    Review and improve this draft
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    disabled={busy || dirty}
                    onClick={() => operation("regenerate")}
                  >
                    Regenerate this concept
                  </Button>
                )}
              </div>
              <div className="space-y-2">
                <EditorField
                  label="Rejection reason"
                  multiline
                  value={reason}
                  onChange={setReason}
                />
                <p className="text-sm text-graphite">
                  Removes this proposal from the review queue and keeps its
                  review history.
                </p>
                <Button
                  variant="secondary"
                  disabled={busy || dirty || !reason.trim()}
                  onClick={() =>
                    perform(
                      () =>
                        reject({
                          proposalId: p._id,
                          revision: p.revision,
                          reason: reason.trim(),
                        }),
                      "Proposal rejected.",
                    )
                  }
                >
                  Reject proposal
                </Button>
              </div>
            </div>
          ) : null}
          <p className="text-sm text-graphite">
            Deleting permanently removes this draft and its unreferenced image.
            Operational run history is retained.
          </p>
          <Button
            variant="ghost"
            disabled={busy || dirty}
            onClick={() => {
              if (
                window.confirm(
                  "Permanently delete this draft and its generated image?",
                )
              )
                void perform(
                  () => remove({ proposalId: p._id, revision: p.revision }),
                  "Proposal deleted.",
                );
            }}
          >
            Delete draft
          </Button>
        </details>
      ) : null}
    </article>
  );
}
