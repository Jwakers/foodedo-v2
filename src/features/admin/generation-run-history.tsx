import type { FunctionReturnType } from "convex/server";
import type { api } from "../../../convex/_generated/api";
import { generationRunSummary } from "@/lib/domain/catalogue-generation";

type Runs = FunctionReturnType<typeof api.catalogueAdmin.overview>["runs"];

export function GenerationRunHistory({ runs }: { runs: Runs }) {
  return (
    <details className="mt-10 border-t border-border pt-4">
      <summary className="min-h-11 cursor-pointer py-3 font-semibold">
        Recent generation runs
      </summary>
      <ul className="divide-y divide-border">
        {runs.map((run) => (
          <li key={run._id} className="space-y-2 py-4 text-sm">
            <p className="font-semibold">
              {run.operation} · {run.status.replaceAll("_", " ")} ·{" "}
              {new Date(run.createdAt).toLocaleString("en-GB")}
            </p>
            {run.failure ? <p className="text-cadmium">{run.failure}</p> : null}
            <p className="text-graphite">
              {run.usage.length} provider calls ·{" "}
              {run.operation === "image"
                ? run.config.imageModel
                : run.config.textModel}{" "}
              ·{" "}
              {run.operation === "image"
                ? `${run.config.imageSize ?? "default resolution"} · ${run.config.imageStyleVersion}`
                : run.config.promptVersion}{" "}
              · {generationRunSummary(run)}
            </p>
            {run.usage.map((event, index) => (
              <p key={index} className="text-xs text-graphite">
                {event.role}: {event.outcome},{" "}
                {Math.round(event.durationMs / 1000)}s, tokens{" "}
                {event.inputTokens ?? "unknown"} in /{" "}
                {event.outputTokens ?? "unknown"} out, cost{" "}
                {event.costUsd === undefined
                  ? "unavailable"
                  : `$${event.costUsd.toFixed(4)}`}
              </p>
            ))}
          </li>
        ))}
      </ul>
    </details>
  );
}
