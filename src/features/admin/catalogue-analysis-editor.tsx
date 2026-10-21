"use client";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import type { EditorialTags } from "@/lib/domain/catalogue-generation";
import { EditorialTagsEditor } from "./editorial-tags-editor";
export function CatalogueAnalysisEditor({
  busy,
  enriching,
  perform,
}: {
  busy: boolean;
  enriching: boolean;
  perform: (job: () => Promise<unknown>, success: string) => Promise<void>;
}) {
  const rows = useQuery(api.catalogueAdmin.analysisRows, {});
  const accept = useMutation(api.catalogueAdmin.reviewMetadata);
  const begin = useMutation(api.catalogueAdmin.begin);
  const [edits, setEdits] = useState<Record<string, EditorialTags>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const pending = rows?.filter((r) => r.metadata?.status === "proposed") ?? [];
  const remaining = rows?.filter((r) => !r.metadata).length ?? 0;
  const reviewed =
    rows?.filter((r) => r.metadata?.status === "reviewed").length ?? 0;
  const selectedRows = pending
    .filter((r) => r.metadata && selected.has(r.metadata._id))
    .slice(0, 100);
  if (rows === undefined) return <p role="status">Loading catalogue tags…</p>;
  return (
    <section className="space-y-4" aria-label="Catalogue tag review">
      <p className="text-sm text-graphite">
        {reviewed} recipes tagged · {pending.length} awaiting tag review ·{" "}
        {remaining} not tagged yet
      </p>
      <Button
        variant="secondary"
        disabled={busy || remaining === 0}
        aria-busy={enriching}
        onClick={() =>
          perform(
            () =>
              begin({ operation: "enrich", requestKey: crypto.randomUUID() }),
            "Tag suggestions started for up to five recipes. Review them here when ready.",
          )
        }
      >
        {enriching ? "Suggesting tags…" : "Suggest tags for 5 recipes"}
      </Button>
      {busy && !enriching ? (
        <p className="text-sm text-graphite">
          Another recipe task is running. You can suggest tags when it finishes.
        </p>
      ) : null}
      {!pending.length ? (
        <div className="border-l-4 border-border p-4">
          <p className="font-semibold">No tag suggestions to review</p>
          <p className="mt-1 text-sm text-graphite">
            {enriching
              ? "Tag suggestions are being prepared. They will appear here when the run finishes."
              : remaining
                ? "Use “Suggest tags for 5 recipes” to create suggestions. Existing recipes simply haven’t been tagged yet."
                : "Existing recipes have been tagged. There is nothing to select or accept."}
          </p>
        </div>
      ) : (
        <>
          <p className="text-sm text-graphite">
            Check the suggested labels, edit any that look wrong, then accept
            them. Only accepted tags contribute to catalogue statistics.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() =>
                setSelected(
                  new Set(pending.slice(0, 100).map((r) => r.metadata!._id)),
                )
              }
            >
              Select suggested tags ({Math.min(pending.length, 100)})
            </Button>
            <Button
              disabled={busy || !selectedRows.length}
              onClick={() =>
                perform(async () => {
                  await accept({
                    rows: selectedRows.map((row) => ({
                      metadataId: row.metadata!._id,
                      fingerprint: row.metadata!.fingerprint,
                      tags: edits[row.metadata!._id] ?? row.metadata!.tags,
                    })),
                  });
                  setSelected(new Set());
                }, "Catalogue tags accepted.")
              }
            >
              Accept selected tags ({selectedRows.length})
            </Button>
          </div>
          <div className="divide-y divide-border">
            {pending.map((row) => (
              <div key={row.metadata!._id} className="py-3">
                <label className="flex min-h-11 cursor-pointer items-center gap-3 font-semibold">
                  <input
                    type="checkbox"
                    className="size-5"
                    disabled={busy}
                    checked={selected.has(row.metadata!._id)}
                    onChange={(event) => {
                      const next = new Set(selected);
                      if (event.target.checked) next.add(row.metadata!._id);
                      else next.delete(row.metadata!._id);
                      setSelected(next);
                    }}
                  />
                  {row.title}
                </label>
                <details>
                  <summary className="min-h-11 cursor-pointer py-3 text-sm text-graphite">
                    {row.metadata!.tags.cuisines.join(", ") ||
                      "Cuisine unknown"}{" "}
                    ·{" "}
                    {row.metadata!.tags.cookingMethods.join(", ") ||
                      "Method unknown"}{" "}
                    — review labels
                  </summary>
                  <fieldset disabled={busy}>
                    <EditorialTagsEditor
                      tags={edits[row.metadata!._id] ?? row.metadata!.tags}
                      onChange={(tags) =>
                        setEdits({ ...edits, [row.metadata!._id]: tags })
                      }
                    />
                  </fieldset>
                </details>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
