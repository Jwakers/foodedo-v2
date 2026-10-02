"use client";

import { CircleAlert, Play } from "lucide-react";
import Image from "next/image";
import { Fragment, useMemo, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { RecipeServingsControl } from "@/features/recipes/recipe-servings-control";
import {
  formatIngredientAmount,
  formatIngredientName,
  formatIngredientNote,
  formatImportedMetadataNotice,
} from "@/lib/domain/recipe-display";
import { formatMealDurationLabel } from "@/lib/domain/plan-display";
import { scaleIngredients } from "@/lib/domain/ingredient-scaling";
import type {
  CatalogueMeal,
  RecipeReviewIssue,
  RecipeSource,
} from "@/lib/domain/recipes";
import { cn } from "@/lib/utils/cn";
import { personalRecipeCookPath, recipeCookPath } from "@/lib/routing/recipes";
import { useRouter } from "next/navigation";

export type RecipeDetailPresentation = "page" | "swapPreview";

/**
 * Shared recipe body used by the standalone detail page and the swap-drawer
 * preview. Chrome (page header / drawer header / footers) stays outside.
 */
export function RecipeDetailContent({
  meal,
  presentation,
  className,
  initialServings,
  onStartCooking,
  planMealAction,
  personalRecipeId,
  reviewIssues = [],
  onReview,
  source,
  ownerActions,
}: {
  meal: CatalogueMeal;
  presentation: RecipeDetailPresentation;
  className?: string;
  initialServings?: number;
  onStartCooking?: () => void;
  planMealAction?: ReactNode;
  personalRecipeId?: string;
  reviewIssues?: RecipeReviewIssue[];
  onReview?: () => void;
  source?: RecipeSource;
  ownerActions?: ReactNode;
}) {
  const router = useRouter();
  const defaultServings = initialServings ?? meal.servings ?? 1;
  const [servingSelection, setServingSelection] = useState(() => ({
    recipeSlug: meal.slug,
    defaultServings,
    servings: defaultServings,
  }));
  if (
    servingSelection.recipeSlug !== meal.slug ||
    servingSelection.defaultServings !== defaultServings
  ) {
    setServingSelection({
      recipeSlug: meal.slug,
      defaultServings,
      servings: defaultServings,
    });
  }
  const selectedServings =
    servingSelection.recipeSlug === meal.slug
      ? servingSelection.servings
      : defaultServings;
  const methodSteps = meal.steps;
  const scalingSafe = meal.servingScaling !== "source_only";
  const ingredients = useMemo(
    () =>
      scalingSafe
        ? scaleIngredients(meal.ingredients, meal.servings, selectedServings)
        : meal.ingredients,
    [meal.ingredients, meal.servings, scalingSafe, selectedServings],
  );
  const durationLabel =
    source?.type === "import"
      ? [
          meal.prepMinutes === undefined
            ? null
            : `${meal.prepMinutes} min prep`,
          meal.cookMinutes === undefined
            ? null
            : `${meal.cookMinutes} min cook`,
        ]
          .filter(Boolean)
          .join(" · ")
      : formatMealDurationLabel(meal.prepMinutes, meal.cookMinutes);
  const metadataNotice = formatImportedMetadataNotice(source);
  const missingReviewLabels = reviewIssues.map((issue) =>
    issue === "servings"
      ? "servings"
      : issue === "prep_minutes"
        ? "preparation time"
        : "cooking time",
  );
  const showPageActions = presentation === "page";
  const handleStartCooking = () => {
    if (onStartCooking) {
      onStartCooking();
      return;
    }
    router.push(
      personalRecipeId
        ? personalRecipeCookPath(personalRecipeId, selectedServings)
        : recipeCookPath(meal.slug, selectedServings, {
            catalogueMealId: meal.id,
            catalogueVersion: meal.version,
          }),
    );
  };
  return (
    <div className={cn("flex flex-col", className)}>
      <div className="relative h-67 w-full overflow-hidden bg-mist">
        {meal.imageSrc ? (
          <Image
            src={meal.imageSrc}
            alt={meal.title}
            fill
            priority={presentation === "page"}
            sizes="(max-width: 700px) 100vw, 700px"
            className="object-cover"
          />
        ) : null}
      </div>

      <div className="flex flex-col gap-2.5 px-page-inline pt-6 pb-5">
        <p className="text-12 font-bold tracking-overline text-cadmium uppercase">
          Foodedo recipe
        </p>
        <h1 className="font-display text-34 font-semibold tracking-heading text-ink">
          {meal.title}
        </h1>

        {meal.servings != null && scalingSafe ? (
          <RecipeServingsControl
            servings={selectedServings}
            onServingsChange={(servings) =>
              setServingSelection({
                recipeSlug: meal.slug,
                defaultServings,
                servings,
              })
            }
            durationLabel={durationLabel}
          />
        ) : (
          <div className="text-14 text-graphite">
            {meal.servings != null ? <p>Serves {meal.servings}</p> : null}
            {durationLabel ? <p>{durationLabel}</p> : null}
            {meal.servings != null && !scalingSafe ? (
              <p className="mt-1 text-12">
                Quantities are kept as written by the author.
              </p>
            ) : null}
          </div>
        )}

        {metadataNotice ? (
          <p className="text-12 leading-4 text-graphite">{metadataNotice}</p>
        ) : null}

        {meal.description ? (
          <p className="text-15 leading-6 text-graphite">{meal.description}</p>
        ) : null}

        {source?.type === "import" ? (
          <p className="text-12 text-graphite">
            Imported from{" "}
            {source.sourceUrl ? (
              <a
                className="font-semibold text-cadmium underline-offset-2 hover:underline"
                href={source.sourceUrl}
                target="_blank"
                rel="noreferrer"
              >
                {source.sourceName ?? "source recipe"}
              </a>
            ) : (
              (source.sourceName ?? "pasted recipe")
            )}
            {source.sourceAuthor ? ` · ${source.sourceAuthor}` : ""}
          </p>
        ) : null}

        {reviewIssues.length > 0 && onReview ? (
          <div className="mt-1 rounded-surface bg-cadmium-soft px-3.5 py-3 text-ink">
            <p className="flex items-center gap-2 text-12 font-bold tracking-label text-cadmium uppercase">
              <CircleAlert aria-hidden="true" className="size-4" />
              Missing recipe details
            </p>
            <p className="mt-1.5 text-13 leading-5 text-graphite">
              Add {formatReadableList(missingReviewLabels)} now or whenever it
              suits you.
            </p>
            <Button
              variant="inline"
              className="mt-1.5 min-h-11 px-0 font-semibold text-cadmium"
              onClick={onReview}
            >
              Add missing details
            </Button>
          </div>
        ) : null}
      </div>

      {showPageActions ? (
        <div className="flex flex-col gap-2 px-page-inline pb-6">
          <Button
            type="button"
            className="h-13 w-full"
            onClick={handleStartCooking}
          >
            <Play
              aria-hidden="true"
              className="size-4.5 fill-current"
              strokeWidth={2.2}
            />
            Start cooking
          </Button>
          {planMealAction}
          {ownerActions}
        </div>
      ) : null}

      <section
        className="px-page-inline"
        aria-labelledby="recipe-ingredients-heading"
      >
        <div className="flex items-end justify-between pt-1 pb-3">
          <h2
            id="recipe-ingredients-heading"
            className="font-display text-24 font-semibold tracking-title text-ink"
          >
            Ingredients
          </h2>
          <p className="text-12 text-graphite">
            {ingredients.length} {ingredients.length === 1 ? "item" : "items"}
          </p>
        </div>
        <ul>
          {ingredients.map((line, index) => (
            <Fragment key={line.id}>
              {line.group && line.group !== ingredients[index - 1]?.group ? (
                <li className="pt-4 pb-1 text-12 font-bold tracking-label text-graphite uppercase">
                  {line.group}
                </li>
              ) : null}
              <li className="flex min-h-11 items-start gap-3 border-b border-border py-2">
                <span className="w-32 shrink-0 text-14 font-semibold text-ink">
                  {formatIngredientAmount(line)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-14 font-medium text-ink">
                    {formatIngredientName(line)}
                  </span>
                  {formatIngredientNote(line) ? (
                    <span className="mt-0.5 block text-13 leading-5 text-graphite">
                      {formatIngredientNote(line)}
                    </span>
                  ) : null}
                </span>
              </li>
            </Fragment>
          ))}
        </ul>
      </section>

      {meal.notes && meal.notes.length > 0 ? (
        <section
          className="px-page-inline pt-5 pb-8"
          aria-labelledby="recipe-notes-heading"
        >
          <details className="rounded-surface bg-mist px-4 py-3">
            <summary
              id="recipe-notes-heading"
              className="min-h-11 cursor-pointer py-2 font-display text-20 font-semibold text-ink"
            >
              Recipe notes ({meal.notes.length})
            </summary>
            <ol className="mt-2 flex flex-col gap-3 pb-2 text-14 leading-5.5 text-graphite">
              {meal.notes.map((note) => (
                <li key={note.id} id={note.id}>
                  <span className="font-semibold text-ink">
                    {note.label ?? "Note"}:{" "}
                  </span>
                  {note.text}
                </li>
              ))}
            </ol>
          </details>
        </section>
      ) : null}

      <section
        className="flex flex-col gap-3 px-page-inline pt-5.5 pb-8"
        aria-labelledby="recipe-method-heading"
      >
        <div className="flex min-h-7 flex-wrap items-end justify-between gap-y-2">
          <div className="flex items-end gap-2">
            <h2
              id="recipe-method-heading"
              className="font-display text-24 font-semibold tracking-title text-ink"
            >
              Method
            </h2>
            <p className="pb-0.5 text-12 text-graphite">
              {methodSteps.length} {methodSteps.length === 1 ? "step" : "steps"}
            </p>
          </div>
          {showPageActions ? (
            <Button
              variant="inline"
              className="gap-1.5 font-semibold text-cadmium"
              onClick={handleStartCooking}
            >
              <Play aria-hidden="true" className="size-4" strokeWidth={1.8} />
              Start cooking
            </Button>
          ) : null}
        </div>

        <ol className="flex flex-col gap-3.5">
          {methodSteps.map((step, index) => (
            <Fragment key={step.id}>
              {step.group && step.group !== methodSteps[index - 1]?.group ? (
                <li className="pt-2 text-12 font-bold tracking-label text-graphite uppercase">
                  {step.group}
                </li>
              ) : null}
              <li className="flex gap-3.5">
                <span
                  className="flex size-7 shrink-0 items-center justify-center rounded-full bg-leaf-soft text-14 font-bold text-leaf"
                  aria-hidden="true"
                >
                  {index + 1}
                </span>
                <p className="min-w-0 flex-1 pt-0.5 text-14 leading-5.5 text-ink">
                  <span className="sr-only">Step {index + 1}. </span>
                  {step.text}
                </p>
              </li>
            </Fragment>
          ))}
        </ol>
      </section>
    </div>
  );
}

function formatReadableList(values: string[]) {
  if (values.length <= 1) return values[0] ?? "the missing details";
  if (values.length === 2) return values.join(" and ");
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}
