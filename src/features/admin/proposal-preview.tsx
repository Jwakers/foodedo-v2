import type { Proposal } from "./proposal-types";

export function ProposalPreview({ content }: { content: Proposal["content"] }) {
  return (
    <section aria-label="Recipe preview" className="space-y-3">
      <p className="text-graphite">{content.description}</p>
      <p className="text-sm font-semibold">
        {content.servings === undefined
          ? "Servings unknown"
          : `Serves ${content.servings}`}{" "}
        · Prep {content.prepMinutes ?? "—"} min · Cook{" "}
        {content.cookMinutes ?? "—"} min · {content.costBand ?? "Cost unknown"}{" "}
        · {content.proteinCategory}
      </p>
      {content.preheat ? (
        <p className="text-sm">
          Preheat oven to {content.preheat.temperatureC}°C.
        </p>
      ) : null}
      <details className="border-t border-border">
        <summary className="min-h-11 cursor-pointer py-3 font-semibold">
          Ingredients ({content.ingredients.length})
        </summary>
        <ul className="divide-y divide-border pb-4 text-sm">
          {content.ingredients.map((ingredient) => (
            <li key={ingredient.id} className="py-2">
              <strong>
                {[ingredient.quantity, ingredient.unit, ingredient.name]
                  .filter(Boolean)
                  .join(" ")}
              </strong>
              {ingredient.note ? ` — ${ingredient.note}` : ""}
            </li>
          ))}
        </ul>
      </details>
      <details className="border-t border-border">
        <summary className="min-h-11 cursor-pointer py-3 font-semibold">
          Method ({content.steps.length} steps)
        </summary>
        <ol className="list-decimal space-y-4 pb-4 pl-6 text-sm leading-relaxed">
          {content.steps.map((step) => (
            <li key={step.id}>{step.text}</li>
          ))}
        </ol>
      </details>
      {content.notes?.length ? (
        <details className="border-t border-border">
          <summary className="min-h-11 cursor-pointer py-3 font-semibold">
            Recipe notes ({content.notes.length})
          </summary>
          <ul className="list-disc space-y-2 pb-4 pl-5 text-sm">
            {content.notes.map((note) => (
              <li key={note.id}>
                {note.label ? <strong>{note.label}: </strong> : null}
                {note.text}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
