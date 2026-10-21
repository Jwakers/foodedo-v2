import Image from "next/image";
import { ProposalPreview } from "./proposal-preview";
import type { Proposal } from "./proposal-types";

export function ProposalStages({ proposal: p }: { proposal: Proposal }) {
  return (
    <ol
      aria-label="Publication stages"
      className="my-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-graphite"
    >
      <li
        className="aria-[current=step]:font-semibold aria-[current=step]:text-ink"
        aria-current={
          p.status === "pending_review" && p.maintenanceMode !== "image"
            ? "step"
            : undefined
        }
      >
        1. Review recipe
      </li>
      <li
        className="aria-[current=step]:font-semibold aria-[current=step]:text-ink"
        aria-current={
          p.status === "generating_image" ||
          p.status === "image_review" ||
          (p.status === "pending_review" && p.maintenanceMode === "image")
            ? "step"
            : undefined
        }
      >
        2. Review photograph
      </li>
      <li
        className="aria-[current=step]:font-semibold aria-[current=step]:text-ink"
        aria-current={p.status === "published" ? "step" : undefined}
      >
        3. Publish
      </li>
    </ol>
  );
}

export function ProposalChanges({ proposal }: { proposal: Proposal }) {
  if (!proposal.changeSummary?.length) return null;
  return (
    <section
      aria-label="Proposed changes"
      className="mb-5 border-l-4 border-border p-4"
    >
      <h3 className="font-semibold">Proposed changes</h3>
      <ul className="mt-2 list-disc space-y-2 pl-5 text-sm">
        {proposal.changeSummary.map((change, index) => (
          <li key={index}>{change}</li>
        ))}
      </ul>
    </section>
  );
}

export function ProposalHistory({ proposal: p }: { proposal: Proposal }) {
  return (
    <>
      <details open className="mt-5 border-t border-border">
        <summary className="min-h-11 cursor-pointer py-3 font-semibold">
          {p.sourceMealId ? "Why these changes?" : "Why this recipe?"}
        </summary>
        <p className="mb-3 text-sm text-graphite">{p.rationale}</p>
        {p.initialPrompt ? (
          <p className="mb-3 text-sm">
            <strong>Your recipe request:</strong> {p.initialPrompt}
          </p>
        ) : null}
        <p className="text-sm text-graphite">{p.concept}</p>
        {p.replacesProposalId ? (
          <p className="mt-2 text-sm">
            This is a replacement for an earlier proposal of the same concept.
          </p>
        ) : null}
      </details>
      {p.sourceMeal ? (
        <details className="my-4 border-t border-border">
          <summary className="min-h-11 cursor-pointer py-3 font-semibold">
            Original published recipe · revision {p.sourceMeal.version}
          </summary>
          {p.sourceImageUrl ? (
            <Image
              src={p.sourceImageUrl}
              alt={`Original photograph of ${p.sourceMeal.title}`}
              width={1536}
              height={864}
              unoptimized
              className="mb-4 aspect-video w-full rounded-compact object-cover"
            />
          ) : null}
          <ProposalPreview content={p.sourceMeal} />
        </details>
      ) : null}
      <details className="border-t border-border">
        <summary className="min-h-11 cursor-pointer py-3 font-semibold">
          Similar catalogue recipes ({p.nearest.length})
        </summary>
        <p className="mb-3 text-sm text-graphite">
          Ingredient overlap is a duplicate warning, not a quality score.
          Published meals and pending proposals are compared.
        </p>
        {p.nearest.length ? (
          <ul className="space-y-2 pb-4 text-sm">
            {p.nearest.map((match) => (
              <li key={match.key}>
                {match.title} · {Math.round(match.overlap * 100)}% ingredient
                overlap{match.exact ? " · same title" : ""}
              </li>
            ))}
          </ul>
        ) : (
          <p className="pb-4 text-sm">No close matches found.</p>
        )}
      </details>
    </>
  );
}
