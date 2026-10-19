"use client";

import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "../../../convex/_generated/api";
import { Button, ButtonLink } from "@/components/ui/button";
import { EditorField, NumberField } from "./recipe-editor-fields";
import { personalRecipeDetailPath } from "@/lib/routing/recipes";
import { SHOPPING_CATEGORIES } from "@/lib/domain/recipes";
import { importJobResumePath } from "./recipe-import-state";

type ImportJob = NonNullable<
  FunctionReturnType<typeof api.recipeImports.getImport>
>;

export function RecipeImportDraftEditor({ job }: { job: ImportJob }) {
  const router = useRouter();
  const update = useMutation(api.recipeImports.updateDraft);
  const finalize = useMutation(api.recipeImports.finalizeDraft);
  const resume = useMutation(api.recipeImports.resumeDraft);
  const retry = useMutation(api.recipeImports.retryImport);
  const initial = job.draft!;
  const [recipe, setRecipe] = useState(initial.recipe);
  const [resolved, setResolved] = useState(initial.resolvedIssueIndexes);
  const [revision, setRevision] = useState(initial.revision);
  const [extraText, setExtraText] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const pending = useRef(false);

  async function save(action: "draft" | "finalize" | "resume" | "retry") {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setMessage("");
    try {
      const nextRevision = await update({
        importId: job._id,
        attempt: job.attempt,
        revision,
        recipe,
        resolvedIssueIndexes: resolved,
      });
      setRevision(nextRevision);
      if (action === "finalize") {
        const recipeId = await finalize({
          importId: job._id,
          attempt: job.attempt,
          revision: nextRevision,
        });
        router.push(personalRecipeDetailPath(recipeId));
      } else if (action === "resume") {
        await resume({
          importId: job._id,
          attempt: job.attempt,
          revision: nextRevision,
          text: extraText,
        });
      } else if (action === "retry") {
        await retry({ importId: job._id });
      } else setMessage("Draft saved.");
    } catch {
      setMessage(
        "Couldn’t save this draft. Check the highlighted issues and field lengths. If it changed elsewhere or expired, reload this page.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  const unresolved = initial.issues.some(
    (issue, index) => issue.blocking && !resolved.includes(index),
  );
  const highlighted = (id: string) =>
    initial.issues.some(
      (issue, index) => issue.targetId === id && !resolved.includes(index),
    );
  return (
    <main className="mx-auto w-full max-w-175 px-page-inline py-8 pb-28">
      <h1 className="font-display text-32 font-semibold text-ink">
        Finish your recipe
      </h1>
      <p className="mt-2 text-15 text-graphite">
        We kept what we could recover. Resolve the missing cooking details
        below, or paste more of the recipe. This draft isn’t in your recipe
        library yet.
      </p>
      <p className="mt-2 text-13 text-graphite">
        Available until{" "}
        {job.expiresAt
          ? new Date(job.expiresAt).toLocaleDateString()
          : "seven days after import"}
        . Save your changes before leaving.
      </p>
      <ButtonLink
        variant="inline"
        href={importJobResumePath(job._id)}
        className="mt-2"
      >
        Resumable import link
      </ButtonLink>
      <fieldset disabled={busy} className="min-w-0 border-0 p-0">
        {job.status === "failed" ? (
          <section
            role="status"
            className="mt-5 grid gap-3 rounded-compact border border-border p-4 text-14"
          >
            <p>
              The latest attempt couldn’t finish. Your last saved draft is still
              here: edit it, save it, or try organising again.
            </p>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => void save("retry")}
            >
              Try organising again
            </Button>
          </section>
        ) : null}
        <section aria-label="Recipe issues" className="mt-5 grid gap-3">
          {initial.issues.map((issue, index) => (
            <label
              key={index}
              className="flex min-h-11 items-start gap-3 rounded-compact border border-border p-3 text-14"
            >
              <input
                type="checkbox"
                className="mt-1 size-5 shrink-0"
                checked={resolved.includes(index)}
                onChange={(event) =>
                  setResolved(
                    event.target.checked
                      ? [...resolved, index]
                      : resolved.filter((item) => item !== index),
                  )
                }
              />
              <span>
                {issue.message}{" "}
                <span className="block text-12 text-graphite">
                  {issue.blocking
                    ? "Confirm when corrected or checked."
                    : "Optional detail—does not prevent saving."}
                </span>
              </span>
            </label>
          ))}
        </section>
        <section className="mt-6 grid gap-4">
          <EditorField
            label="Title"
            value={recipe.title}
            onChange={(title) => setRecipe({ ...recipe, title })}
          />
          <EditorField
            label="Description"
            multiline
            value={recipe.description ?? ""}
            onChange={(description) =>
              setRecipe({ ...recipe, description: description || undefined })
            }
          />
          <div className="grid grid-cols-3 gap-3">
            <NumberField
              label="Serves"
              value={recipe.servings}
              onChange={(servings) => setRecipe({ ...recipe, servings })}
            />
            <NumberField
              label="Prep min"
              value={recipe.prepMinutes}
              onChange={(prepMinutes) => setRecipe({ ...recipe, prepMinutes })}
            />
            <NumberField
              label="Cook min"
              value={recipe.cookMinutes}
              onChange={(cookMinutes) => setRecipe({ ...recipe, cookMinutes })}
            />
          </div>
        </section>
        <h2 className="mt-8 font-display text-24">Ingredients</h2>
        <div className="mt-3 grid gap-4">
          {recipe.ingredients.map((line, index) => {
            const change = (patch: Partial<typeof line>) =>
              setRecipe({
                ...recipe,
                ingredients: recipe.ingredients.map((item, position) =>
                  position === index ? { ...item, ...patch } : item,
                ),
              });
            return (
              <article
                key={line.id}
                className={`grid gap-3 rounded-surface border p-4 ${highlighted(line.id) ? "border-cadmium" : "border-border"}`}
              >
                <EditorField
                  label="Ingredient"
                  value={line.name}
                  onChange={(name) => change({ name })}
                />
                <EditorField
                  label="Amount"
                  value={
                    line.amountText ??
                    [line.quantity, line.unit].filter(Boolean).join(" ")
                  }
                  onChange={(amountText) =>
                    change({
                      amountText: amountText || undefined,
                      quantity: undefined,
                      unit: undefined,
                    })
                  }
                />
                <EditorField
                  label="Preparation note"
                  value={line.note ?? ""}
                  onChange={(note) => change({ note: note || undefined })}
                />
                <EditorField
                  label="Group"
                  value={line.group ?? ""}
                  onChange={(group) => change({ group: group || undefined })}
                />
                <label className="text-12 text-graphite">
                  Shopping category
                  <select
                    className="mt-1 min-h-11 w-full rounded-compact border border-border bg-paper p-2 text-16 text-ink"
                    value={line.shoppingCategory}
                    onChange={(event) =>
                      change({
                        shoppingCategory: event.target
                          .value as typeof line.shoppingCategory,
                      })
                    }
                  >
                    {SHOPPING_CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {category.replaceAll("_", " ")}
                      </option>
                    ))}
                  </select>
                </label>
                <Button
                  variant="inline"
                  onClick={() =>
                    setRecipe({
                      ...recipe,
                      ingredients: recipe.ingredients.filter(
                        (_, position) => position !== index,
                      ),
                    })
                  }
                >
                  Remove ingredient
                </Button>
              </article>
            );
          })}
          <Button
            variant="secondary"
            onClick={() =>
              setRecipe({
                ...recipe,
                ingredients: [
                  ...recipe.ingredients,
                  {
                    id: `ingredient-${crypto.randomUUID()}`,
                    name: "",
                    shoppingCategory: "other",
                  },
                ],
              })
            }
          >
            Add ingredient
          </Button>
        </div>
        <h2 className="mt-8 font-display text-24">Method</h2>
        <div className="mt-3 grid gap-4">
          {recipe.steps.map((step, index) => (
            <article
              key={step.id}
              className={`rounded-surface border p-4 ${highlighted(step.id) ? "border-cadmium" : "border-border"}`}
            >
              <EditorField
                label={`Step ${index + 1}`}
                multiline
                value={step.text}
                onChange={(text) =>
                  setRecipe({
                    ...recipe,
                    steps: recipe.steps.map((item, position) =>
                      position === index ? { ...item, text } : item,
                    ),
                  })
                }
              />
              <Button
                variant="inline"
                onClick={() =>
                  setRecipe({
                    ...recipe,
                    steps: recipe.steps.filter(
                      (_, position) => position !== index,
                    ),
                  })
                }
              >
                Remove step
              </Button>
            </article>
          ))}
          <Button
            variant="secondary"
            onClick={() =>
              setRecipe({
                ...recipe,
                steps: [
                  ...recipe.steps,
                  { id: `step-${crypto.randomUUID()}`, text: "" },
                ],
              })
            }
          >
            Add step
          </Button>
        </div>
        {recipe.notes?.map((note, index) => (
          <div className="mt-5" key={note.id}>
            <EditorField
              label={note.label ?? `Recipe note ${index + 1}`}
              multiline
              value={note.text}
              onChange={(text) =>
                setRecipe({
                  ...recipe,
                  notes: recipe.notes?.map((item, position) =>
                    position === index ? { ...item, text } : item,
                  ),
                })
              }
            />
          </div>
        ))}
        <section className="mt-8 grid gap-3">
          <EditorField
            label="Paste additional recipe text"
            multiline
            value={extraText}
            onChange={setExtraText}
          />
          <Button
            variant="secondary"
            disabled={busy || !extraText.trim()}
            onClick={() => void save("resume")}
          >
            Organise with this additional text
          </Button>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => void save("draft")}
          >
            Save draft
          </Button>
          <Button
            disabled={
              busy ||
              unresolved ||
              !recipe.ingredients.length ||
              !recipe.steps.length
            }
            onClick={() => void save("finalize")}
          >
            {busy ? "Saving…" : "Save recipe to my library"}
          </Button>
          <p role="status" className="text-14 text-graphite">
            {message}
          </p>
        </section>
      </fieldset>
    </main>
  );
}
