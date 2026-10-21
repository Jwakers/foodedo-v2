"use client";
import { useState } from "react";
import type { EditorialTags } from "@/lib/domain/catalogue-generation";
import { EditorField } from "@/features/recipes/recipe-editor-fields";
export const adminInputClass =
  "min-h-11 w-full rounded-compact border border-border bg-paper px-3 py-2 text-base text-ink focus-visible:outline-2 focus-visible:outline-cadmium";
export function EditorialTagsEditor({
  tags,
  onChange,
}: {
  tags: EditorialTags;
  onChange: (tags: EditorialTags) => void;
}) {
  const lists = [
    ["cuisines", "Cuisine / regional influence"],
    ["cookingMethods", "Cooking methods"],
    ["flavourProfile", "Flavour profile"],
  ] as const;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {lists.map(([key, label]) => (
        <TagListField
          key={key}
          label={label}
          values={tags[key]}
          onChange={(values) => onChange({ ...tags, [key]: values })}
        />
      ))}
      <EditorField
        label="Main ingredient / protein source"
        value={tags.proteinSource}
        onChange={(value) => onChange({ ...tags, proteinSource: value })}
      />
      <EditorField
        label="Carb base"
        value={tags.carbBase}
        onChange={(value) => onChange({ ...tags, carbBase: value })}
      />
      {(
        [
          ["mealOccasion", "Meal occasion", ["lunch", "dinner", "unknown"]],
          [
            "complexity",
            "Complexity",
            ["simple", "moderate", "complex", "unknown"],
          ],
          ["vegetarian", "Vegetarian", ["yes", "no", "unknown"]],
          ["vegan", "Vegan", ["yes", "no", "unknown"]],
        ] as const
      ).map(([key, label, options]) => (
        <label key={key} className="text-sm font-semibold text-graphite">
          {label}
          <select
            className={`${adminInputClass} mt-1`}
            value={tags[key]}
            onChange={(event) =>
              onChange({ ...tags, [key]: event.target.value })
            }
          >
            {options.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </label>
      ))}
      <p className="text-sm text-graphite sm:col-span-2">
        Editorial analysis only. These labels do not guarantee that a recipe is
        free of allergens.
      </p>
    </div>
  );
}

function TagListField({
  label,
  values,
  onChange,
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
}) {
  const [text, setText] = useState(values.join(", "));
  return (
    <EditorField
      label={`${label} (comma separated)`}
      value={text}
      onChange={(value) => {
        setText(value);
        onChange(
          value
            .split(",")
            .map((part) => part.trim().toLowerCase())
            .filter(Boolean),
        );
      }}
    />
  );
}
