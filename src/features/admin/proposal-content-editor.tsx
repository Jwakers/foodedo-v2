"use client";
import { RecipeTimerEditor } from "@/features/recipes/recipe-timer-editor";
import type { Dispatch, SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import {
  EditorField,
  NumberField,
} from "@/features/recipes/recipe-editor-fields";
import { EditorialTagsEditor, adminInputClass } from "./editorial-tags-editor";
import {
  PROTEIN_CATEGORIES,
  COST_BANDS,
  SHOPPING_CATEGORIES,
} from "@/lib/domain/recipes";
import type { Proposal } from "./proposal-types";

export function ProposalContentEditor({
  content,
  setContent,
  tags,
  setTags,
  disabled,
}: {
  content: Proposal["content"];
  setContent: Dispatch<SetStateAction<Proposal["content"]>>;
  tags: Proposal["tags"];
  setTags: Dispatch<SetStateAction<Proposal["tags"]>>;
  disabled: boolean;
}) {
  return (
    <fieldset disabled={disabled} className="space-y-5 disabled:opacity-70">
      <legend className="sr-only">Edit recipe details</legend>
      <EditorField
        label="Title"
        value={content.title}
        onChange={(title) => setContent((current) => ({ ...current, title }))}
      />
      <EditorField
        label="Description"
        multiline
        value={content.description ?? ""}
        onChange={(description) =>
          setContent((current) => ({ ...current, description }))
        }
      />
      <div className="grid grid-cols-3 gap-3">
        <NumberField
          label="Servings"
          value={content.servings}
          onChange={(servings) =>
            setContent((current) => ({ ...current, servings }))
          }
        />
        <NumberField
          label="Prep minutes"
          value={content.prepMinutes}
          onChange={(prepMinutes) =>
            setContent((current) => ({ ...current, prepMinutes }))
          }
        />
        <NumberField
          label="Cook minutes"
          value={content.cookMinutes}
          onChange={(cookMinutes) =>
            setContent((current) => ({ ...current, cookMinutes }))
          }
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-semibold">
          Protein
          <select
            className={adminInputClass}
            value={content.proteinCategory}
            onChange={(e) =>
              setContent((current) => ({
                ...current,
                proteinCategory: e.target
                  .value as typeof content.proteinCategory,
              }))
            }
          >
            {PROTEIN_CATEGORIES.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold">
          Cost band
          <select
            className={adminInputClass}
            value={content.costBand ?? ""}
            onChange={(e) =>
              setContent((current) => ({
                ...current,
                costBand: (e.target.value ||
                  undefined) as typeof content.costBand,
              }))
            }
          >
            <option value="">Unknown</option>
            {COST_BANDS.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
      </div>
      <NumberField
        label="Oven preheat °C (leave blank if unnecessary)"
        value={content.preheat?.temperatureC}
        onChange={(temperatureC) =>
          setContent((current) => ({
            ...current,
            preheat:
              temperatureC === undefined
                ? undefined
                : { appliance: "oven", temperatureC },
          }))
        }
      />
      <details className="border-t border-border">
        <summary className="min-h-11 cursor-pointer py-3 font-semibold">
          Ingredients ({content.ingredients.length})
        </summary>
        <div className="space-y-5 pb-4">
          {content.ingredients.map((line, index) => (
            <div
              key={line.id}
              className="space-y-3 border-b border-border pb-4"
            >
              <EditorField
                label={`Ingredient ${index + 1}`}
                value={line.name}
                onChange={(name) =>
                  setContent((current) => ({
                    ...current,
                    ingredients: current.ingredients.map((v, i) =>
                      i === index ? { ...v, name } : v,
                    ),
                  }))
                }
              />
              <div className="grid grid-cols-2 gap-3">
                {(
                  [
                    ["quantity", "Quantity"],
                    ["unit", "Unit"],
                  ] as const
                ).map(([key, label]) => (
                  <EditorField
                    key={key}
                    label={label}
                    value={line[key] ?? ""}
                    onChange={(value) =>
                      setContent((current) => ({
                        ...current,
                        ingredients: current.ingredients.map((v, i) =>
                          i === index ? { ...v, [key]: value || undefined } : v,
                        ),
                      }))
                    }
                  />
                ))}
              </div>
              <EditorField
                label="Preparation / note"
                value={line.note ?? ""}
                onChange={(note) =>
                  setContent((current) => ({
                    ...current,
                    ingredients: current.ingredients.map((v, i) =>
                      i === index ? { ...v, note: note || undefined } : v,
                    ),
                  }))
                }
              />
              <label className="text-sm font-semibold">
                Shopping group
                <select
                  className={adminInputClass}
                  value={line.shoppingCategory}
                  onChange={(e) =>
                    setContent((current) => ({
                      ...current,
                      ingredients: current.ingredients.map((v, i) =>
                        i === index
                          ? {
                              ...v,
                              shoppingCategory: e.target
                                .value as typeof line.shoppingCategory,
                            }
                          : v,
                      ),
                    }))
                  }
                >
                  {SHOPPING_CATEGORIES.map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
              <Button
                variant="ghost"
                onClick={() =>
                  setContent((current) => ({
                    ...current,
                    ingredients: current.ingredients.filter(
                      (_, i) => i !== index,
                    ),
                  }))
                }
              >
                Remove ingredient {index + 1}
              </Button>
            </div>
          ))}
          <Button
            variant="secondary"
            onClick={() =>
              setContent((current) => ({
                ...current,
                ingredients: [
                  ...current.ingredients,
                  {
                    id: crypto.randomUUID(),
                    name: "",
                    quantity: "",
                    shoppingCategory: "other",
                  },
                ],
              }))
            }
          >
            Add ingredient
          </Button>
        </div>
      </details>
      <details className="border-t border-border">
        <summary className="min-h-11 cursor-pointer py-3 font-semibold">
          Method ({content.steps.length} steps)
        </summary>
        <div className="space-y-5 pb-4">
          {content.steps.map((step, index) => (
            <div key={step.id} className="space-y-2">
              <EditorField
                label={`Step ${index + 1}`}
                multiline
                value={step.text}
                onChange={(text) =>
                  setContent((current) => ({
                    ...current,
                    steps: current.steps.map((v, i) =>
                      i === index ? { ...v, text } : v,
                    ),
                  }))
                }
              />
              <RecipeTimerEditor
                stepNumber={index + 1}
                cues={step.timerCues}
                onChange={(timerCues) =>
                  setContent((current) => ({
                    ...current,
                    steps: current.steps.map((item, position) =>
                      position === index ? { ...item, timerCues } : item,
                    ),
                  }))
                }
              />
              <Button
                variant="ghost"
                onClick={() =>
                  setContent((current) => ({
                    ...current,
                    steps: current.steps.filter((_, i) => i !== index),
                  }))
                }
              >
                Remove step {index + 1}
              </Button>
            </div>
          ))}
          <Button
            variant="secondary"
            onClick={() =>
              setContent((current) => ({
                ...current,
                steps: [
                  ...current.steps,
                  { id: crypto.randomUUID(), text: "" },
                ],
              }))
            }
          >
            Add step
          </Button>
        </div>
      </details>
      <details className="border-t border-border">
        <summary className="min-h-11 cursor-pointer py-3 font-semibold">
          Recipe notes ({content.notes?.length ?? 0})
        </summary>
        <div className="space-y-5 pb-4">
          {(content.notes ?? []).map((note, index) => (
            <div key={note.id}>
              <EditorField
                label={`Note ${index + 1}`}
                multiline
                value={note.text}
                onChange={(text) =>
                  setContent((current) => ({
                    ...current,
                    notes: current.notes?.map((v, i) =>
                      i === index ? { ...v, text } : v,
                    ),
                  }))
                }
              />
              <Button
                variant="ghost"
                onClick={() =>
                  setContent((current) => ({
                    ...current,
                    notes: current.notes?.filter((item) => item.id !== note.id),
                    ingredients: current.ingredients.map((item) => ({
                      ...item,
                      noteRefs: item.noteRefs?.filter((id) => id !== note.id),
                    })),
                    steps: current.steps.map((item) => ({
                      ...item,
                      noteRefs: item.noteRefs?.filter((id) => id !== note.id),
                    })),
                  }))
                }
              >
                Remove note {index + 1}
              </Button>
            </div>
          ))}
          <Button
            variant="secondary"
            onClick={() =>
              setContent((current) => ({
                ...current,
                notes: [
                  ...(current.notes ?? []),
                  { id: crypto.randomUUID(), text: "" },
                ],
              }))
            }
          >
            Add note
          </Button>
        </div>
      </details>
      <details className="border-y border-border py-3">
        <summary className="min-h-11 cursor-pointer py-3 font-semibold">
          Editorial analysis tags
        </summary>
        <EditorialTagsEditor tags={tags} onChange={setTags} />
      </details>
    </fieldset>
  );
}
