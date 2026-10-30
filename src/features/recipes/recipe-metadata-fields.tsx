"use client";

import type { RecipeContent } from "@/lib/domain/recipes";
import { EditorField, NumberField } from "./recipe-editor-fields";

type RecipeMetadata = Pick<
  RecipeContent,
  | "title"
  | "description"
  | "minimumServings"
  | "servings"
  | "prepMinutes"
  | "cookMinutes"
>;

export function RecipeMetadataFields({
  recipe,
  onChange,
  className,
}: {
  recipe: RecipeMetadata;
  onChange: (patch: Partial<RecipeMetadata>) => void;
  className: string;
}) {
  return (
    <section className={className}>
      <EditorField
        label="Title"
        value={recipe.title}
        onChange={(title) => onChange({ title })}
      />
      <EditorField
        label="Description"
        multiline
        value={recipe.description ?? ""}
        onChange={(description) =>
          onChange({ description: description || undefined })
        }
      />
      <div>
        <NumberField
          label="Minimum servings"
          min={1}
          max={recipe.servings ?? 1000}
          value={recipe.minimumServings}
          onChange={(minimumServings) => onChange({ minimumServings })}
        />
        <p className="mt-1 text-12 text-graphite">
          Smallest practical recipe size. Leave blank to allow ordinary scaling.
        </p>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <NumberField
          label="Serves"
          value={recipe.servings}
          onChange={(servings) => onChange({ servings })}
        />
        <NumberField
          label="Prep min"
          value={recipe.prepMinutes}
          onChange={(prepMinutes) => onChange({ prepMinutes })}
        />
        <NumberField
          label="Cook min"
          value={recipe.cookMinutes}
          onChange={(cookMinutes) => onChange({ cookMinutes })}
        />
      </div>
    </section>
  );
}
