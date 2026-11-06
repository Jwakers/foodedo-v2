import { Fragment } from "react";
import type { RecipeStep } from "@/lib/domain/recipes";
import type { ScaledIngredientLine } from "@/lib/domain/ingredient-scaling";
import {
  formatIngredientAmount,
  formatIngredientName,
  formatIngredientNote,
} from "@/lib/domain/recipe-display";
import { formatRecipeHeading } from "@/lib/domain/recipe-headings";
import {
  validStepIngredientReferences,
  type StepIngredientReference,
} from "@/lib/domain/step-ingredient-references";

/** Presentation only: recipe matching and ambiguity decisions happen upstream. */
export function StepIngredientContent({
  step,
  ingredients,
}: {
  step: RecipeStep;
  ingredients: ScaledIngredientLine[];
}) {
  const mapping = step.ingredientMapping;
  // Check bounds before slicing text, including when an older client has cached
  // unsupported metadata. Render plain prose rather than a broken instruction.
  const byId = new Map(ingredients.map((line) => [line.id, line]));
  const references = validStepIngredientReferences(
    mapping,
    step.text,
    new Set(byId.keys()),
  )
    ? mapping.references
    : [];
  const resolved = references.filter(
    (reference) =>
      reference.status === "resolved" &&
      reference.ingredientIds.length === 1 &&
      byId.has(reference.ingredientIds[0]!),
  );
  const rows = new Map<
    string,
    {
      line: ScaledIngredientLine;
      usage: StepIngredientReference["usage"];
      optional: boolean;
    }
  >();
  for (const reference of resolved) {
    const id = reference.ingredientIds[0]!;
    const previous = rows.get(id);
    rows.set(id, {
      line: byId.get(id)!,
      optional:
        (reference.optional ?? reference.usage === "optional") &&
        (previous?.optional ?? true),
      usage:
        previous && previous.usage !== reference.usage
          ? "recipe_total"
          : reference.usage,
    });
  }
  const showRecipeTotalNote = [...rows.values()].some(
    ({ usage }) => usage !== "whole" && usage !== "optional",
  );
  const uncertain = new Map<string, ScaledIngredientLine>();
  for (const reference of references.filter(
    (reference) => reference.status === "ambiguous",
  )) {
    for (const id of reference.ingredientIds) {
      const line = byId.get(id);
      if (line) uncertain.set(id, line);
    }
  }
  return (
    <>
      <p className="mt-7 font-display text-34 font-semibold leading-10 tracking-heading text-ink">
        {resolved.map((reference, index) => {
          const prefix = step.text.slice(
            resolved[index - 1]?.end ?? 0,
            reference.start,
          );
          return (
            <Fragment key={reference.start}>
              {prefix}
              <mark className="rounded-sm bg-leaf-soft px-0.5 text-inherit underline decoration-leaf/50 decoration-2 underline-offset-4">
                {step.text.slice(reference.start, reference.end)}
              </mark>
            </Fragment>
          );
        })}
        {step.text.slice(resolved.at(-1)?.end ?? 0)}
      </p>
      {rows.size > 0 ? (
        <section
          className="mt-6 rounded-compact bg-mist px-4 py-4"
          aria-label="Ingredients for this step"
        >
          <h2 className="text-11 font-bold tracking-label text-graphite uppercase">
            You’ll need
          </h2>
          <ul className="mt-2 divide-y divide-border">
            {[...rows].map(([id, { line, optional }]) => (
              <li key={id} className="py-2.5">
                <p className="text-15 font-semibold leading-6 text-ink">
                  {formatIngredientAmount(line)} {formatIngredientName(line)}
                </p>
                {formatIngredientNote(line) ? (
                  <p className="mt-0.5 text-14 leading-5.5 text-graphite">
                    {formatIngredientNote(line)}
                  </p>
                ) : null}
                {optional ? (
                  <p className="mt-1 text-13 leading-5 text-graphite">
                    Optional
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
          {showRecipeTotalNote ? (
            <p className="mt-2 text-12 leading-5 text-graphite">
              Quantities shown are recipe totals.
            </p>
          ) : null}
        </section>
      ) : null}
      {uncertain.size > 0 ? (
        <section
          aria-label="Ingredient reference"
          className="mt-4 rounded-compact border border-border px-4 py-4 text-14 text-graphite"
        >
          <h2 className="text-11 font-bold tracking-label uppercase">
            Ingredient reference
          </h2>
          <p className="mt-2 pb-3 leading-5.5">
            Check which ingredient the instruction means. Quantities below are
            recipe totals.
          </p>
          <ul className="divide-y divide-border pb-2">
            {[...uncertain].map(([id, line]) => (
              <li key={id} className="py-2">
                <p className="font-semibold text-ink">
                  {formatIngredientAmount(line)} {formatIngredientName(line)}
                </p>
                {line.group ? (
                  <p className="mt-0.5 text-13">
                    {formatRecipeHeading(line.group)}
                  </p>
                ) : null}
                {formatIngredientNote(line) ? (
                  <p className="mt-0.5 leading-5">
                    {formatIngredientNote(line)}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
