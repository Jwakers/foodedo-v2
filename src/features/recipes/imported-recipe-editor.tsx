"use client";

import { useMutation } from "convex/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useReducer, useState } from "react";
import { toast } from "sonner";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  usePersonalRecipe,
  type PersonalRecipeMeal,
} from "@/features/recipes/use-personal-recipe";
import type { RecipeContent } from "@/lib/domain/recipes";
import { normaliseImportedIngredientText } from "@/lib/domain/recipe-normalization";
import {
  parsePersonalRecipeId,
  personalRecipeDetailPath,
} from "@/lib/routing/recipes";

const fieldClass =
  "min-h-11 w-full rounded-compact border border-border bg-paper px-3 py-2 text-14 text-ink focus:border-cadmium focus:outline-none";

export function ImportedRecipeEditor() {
  const searchParams = useSearchParams();
  const recipeId = parsePersonalRecipeId(searchParams);
  const meal = usePersonalRecipe(recipeId);

  if (!recipeId || meal === null)
    return (
      <main className="px-page-inline py-16 text-center">
        Recipe unavailable.
      </main>
    );
  if (!meal)
    return (
      <main className="px-page-inline py-16 text-center text-graphite">
        Loading recipe…
      </main>
    );

  return (
    <ImportedRecipeEditorForm key={meal.id} recipeId={recipeId} meal={meal} />
  );
}

function ImportedRecipeEditorForm({
  recipeId,
  meal,
}: {
  recipeId: string;
  meal: PersonalRecipeMeal;
}) {
  const router = useRouter();
  const updateImported = useMutation(api.recipes.updateImported);
  const [draft, setDraft] = useReducer(recipeDraftReducer, meal, createDraft);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      await updateImported({
        recipeId: recipeId as Id<"recipes">,
        recipe: draft,
      });
      toast.success("Recipe saved.");
      router.push(personalRecipeDetailPath(recipeId));
    } catch (error) {
      console.error("Failed to update imported recipe.", error);
      toast.error("Foodedo couldn’t save those changes.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-175 px-page-inline py-8 pb-28">
      <p className="text-12 font-bold tracking-overline text-cadmium uppercase">
        Imported recipe
      </p>
      <h1 className="mt-2 font-display text-32 font-semibold text-ink">
        Make it yours
      </h1>
      <p className="mt-2 text-14 leading-5.5 text-graphite">
        Foodedo keeps the source wording beside changed fields so corrections
        stay understandable and reversible.
      </p>
      <p className="mt-2 text-13 font-semibold text-ink">
        Changes are saved when you tap Save changes.
      </p>

      <section className="mt-7 grid gap-4">
        <EditorField
          label="Title"
          value={draft.title}
          onChange={(title) => setDraft({ ...draft, title })}
        />
        <EditorField
          label="Description"
          multiline
          value={draft.description ?? ""}
          onChange={(description) =>
            setDraft({ ...draft, description: description || undefined })
          }
        />
        <div className="grid grid-cols-3 gap-3">
          <NumberField
            label="Serves"
            value={draft.servings}
            onChange={(servings) => setDraft({ ...draft, servings })}
          />
          <NumberField
            label="Prep min"
            value={draft.prepMinutes}
            onChange={(prepMinutes) => setDraft({ ...draft, prepMinutes })}
          />
          <NumberField
            label="Cook min"
            value={draft.cookMinutes}
            onChange={(cookMinutes) => setDraft({ ...draft, cookMinutes })}
          />
        </div>
      </section>

      <EditableListHeading title="Ingredients" />
      <div className="grid gap-4">
        {draft.ingredients.map((ingredient, index) => (
          <article
            key={ingredient.id}
            className="rounded-surface border border-border p-4"
          >
            <div className="grid grid-cols-[7rem_1fr] gap-3">
              <EditorField
                label="Amount"
                value={
                  ingredient.amountText ??
                  [ingredient.quantity, ingredient.unit]
                    .filter(Boolean)
                    .join(" ")
                }
                onChange={(amountText) =>
                  setDraft({
                    ...draft,
                    ingredients: draft.ingredients.map((line, lineIndex) =>
                      lineIndex === index
                        ? {
                            ...line,
                            amountText: amountText || undefined,
                            quantity: undefined,
                            unit: undefined,
                          }
                        : line,
                    ),
                  })
                }
              />
              <EditorField
                label="Ingredient"
                value={ingredient.name}
                onChange={(name) =>
                  setDraft({
                    ...draft,
                    ingredients: draft.ingredients.map((line, lineIndex) =>
                      lineIndex === index ? { ...line, name } : line,
                    ),
                  })
                }
              />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <EditorField
                label="Group"
                value={ingredient.group ?? ""}
                onChange={(group) =>
                  setDraft({
                    ...draft,
                    ingredients: draft.ingredients.map((line, lineIndex) =>
                      lineIndex === index
                        ? { ...line, group: group || undefined }
                        : line,
                    ),
                  })
                }
              />
              <EditorField
                label="Note"
                value={ingredient.note ?? ""}
                onChange={(note) =>
                  setDraft({
                    ...draft,
                    ingredients: draft.ingredients.map((line, lineIndex) =>
                      lineIndex === index
                        ? { ...line, note: note || undefined }
                        : line,
                    ),
                  })
                }
              />
            </div>
            {ingredient.sourceText ? (
              <SourceOriginal
                text={ingredient.sourceText}
                onUse={() => {
                  const original = normaliseImportedIngredientText(
                    ingredient.sourceText!,
                  );
                  setDraft({
                    ...draft,
                    ingredients: draft.ingredients.map((line, lineIndex) =>
                      lineIndex === index
                        ? {
                            ...line,
                            name: original.name,
                            quantity: original.quantity,
                            unit: original.unit,
                            amountText: original.amountText,
                            note: original.note,
                            noteRefs: original.noteRefs,
                          }
                        : line,
                    ),
                  });
                }}
              />
            ) : null}
          </article>
        ))}
      </div>

      <EditableListHeading title="Method" />
      <div className="grid gap-4">
        {draft.steps.map((step, index) => (
          <article
            key={step.id}
            className="rounded-surface border border-border p-4"
          >
            <EditorField
              label={`Step ${index + 1}`}
              multiline
              value={step.text}
              onChange={(text) =>
                setDraft({
                  ...draft,
                  steps: draft.steps.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, text } : item,
                  ),
                })
              }
            />
            <div className="mt-3">
              <EditorField
                label="Section heading"
                value={step.group ?? ""}
                onChange={(group) =>
                  setDraft({
                    ...draft,
                    steps: draft.steps.map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, group: group || undefined }
                        : item,
                    ),
                  })
                }
              />
            </div>
            {step.sourceText ? (
              <SourceOriginal
                text={step.sourceText}
                onUse={() =>
                  setDraft({
                    ...draft,
                    steps: draft.steps.map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, text: step.sourceText! }
                        : item,
                    ),
                  })
                }
              />
            ) : null}
          </article>
        ))}
      </div>

      {draft.notes?.length ? (
        <EditableListHeading title="Recipe notes" />
      ) : null}
      <div className="grid gap-4">
        {draft.notes?.map((note, index) => (
          <article
            key={note.id}
            className="rounded-surface border border-border p-4"
          >
            <EditorField
              label={note.label ?? `Note ${index + 1}`}
              multiline
              value={note.text}
              onChange={(text) =>
                setDraft({
                  ...draft,
                  notes: draft.notes?.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, text } : item,
                  ),
                })
              }
            />
            {note.sourceText ? (
              <SourceOriginal
                text={note.sourceText}
                onUse={() =>
                  setDraft({
                    ...draft,
                    notes: draft.notes?.map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, text: note.sourceText! }
                        : item,
                    ),
                  })
                }
              />
            ) : null}
          </article>
        ))}
      </div>

      <div className="fixed inset-x-0 bottom-(--app-nav-height) z-50 border-t border-border bg-paper/95 px-page-inline pt-3 pb-3 backdrop-blur">
        <div className="mx-auto flex max-w-175 gap-3">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => router.back()}
          >
            Cancel
          </Button>
          <Button
            className="flex-1"
            disabled={saving}
            onClick={() => void save()}
          >
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>
    </main>
  );
}

function recipeDraftReducer(
  _current: RecipeContent,
  next: RecipeContent,
): RecipeContent {
  return next;
}

function createDraft(meal: PersonalRecipeMeal): RecipeContent {
  return {
    title: meal.title,
    ...(meal.description ? { description: meal.description } : {}),
    ingredients: structuredClone(meal.ingredients),
    steps: structuredClone(meal.steps),
    ...(meal.servings === undefined ? {} : { servings: meal.servings }),
    ...(meal.prepMinutes === undefined
      ? {}
      : { prepMinutes: meal.prepMinutes }),
    ...(meal.cookMinutes === undefined
      ? {}
      : { cookMinutes: meal.cookMinutes }),
    proteinCategory: meal.proteinCategory,
    ...(meal.notes === undefined ? {} : { notes: structuredClone(meal.notes) }),
    servingScaling: meal.servingScaling ?? "source_only",
  };
}

function EditableListHeading({ title }: { title: string }) {
  return (
    <h2 className="mt-8 mb-3 font-display text-24 font-semibold text-ink">
      {title}
    </h2>
  );
}

function EditorField({
  label,
  value,
  multiline = false,
  onChange,
}: {
  label: string;
  value: string;
  multiline?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-12 font-semibold text-graphite">
      {label}
      {multiline ? (
        <textarea
          className={`${fieldClass} mt-1 min-h-24 resize-y`}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          className={`${fieldClass} mt-1`}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value?: number;
  onChange: (value: number | undefined) => void;
}) {
  return (
    <label className="block text-12 font-semibold text-graphite">
      {label}
      <input
        type="number"
        min={0}
        className={`${fieldClass} mt-1`}
        value={value ?? ""}
        onChange={(event) =>
          onChange(
            event.target.value === "" ? undefined : Number(event.target.value),
          )
        }
      />
    </label>
  );
}

function SourceOriginal({ text, onUse }: { text: string; onUse: () => void }) {
  return (
    <div className="mt-3 rounded-compact bg-mist p-3 text-12 leading-5 text-graphite">
      <p>
        <span className="font-semibold text-ink">Original: </span>
        {text}
      </p>
      <Button
        variant="inline"
        className="mt-1 min-h-11 text-cadmium"
        onClick={onUse}
      >
        Use original
      </Button>
    </div>
  );
}
