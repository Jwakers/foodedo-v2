"use client";

import { CalendarPlus, Play } from "lucide-react";
import Image from "next/image";

import { Button } from "@/components/ui/button";
import { RecipeServingsControl } from "@/features/recipes/recipe-servings-control";
import {
  formatIngredientAmount,
  formatIngredientName,
} from "@/lib/domain/recipe-display";
import { formatMealDurationLabel } from "@/lib/domain/plan-display";
import type { CatalogueMeal } from "@/lib/domain/recipes";
import { temporaryFeedback } from "@/lib/ui/temporary-feedback";
import { cn } from "@/lib/utils/cn";

export type RecipeDetailPresentation = "page" | "swapPreview";

/**
 * Shared recipe body used by the standalone detail page and the swap-drawer
 * preview. Chrome (page header / drawer header / footers) stays outside.
 */
export function RecipeDetailContent({
  meal,
  presentation,
  className,
  onStartCooking,
  onPlanMeal,
}: {
  meal: CatalogueMeal;
  presentation: RecipeDetailPresentation;
  className?: string;
  onStartCooking?: () => void;
  onPlanMeal?: () => void;
}) {
  const durationLabel = formatMealDurationLabel(
    meal.prepMinutes,
    meal.cookMinutes,
  );
  const showPageActions = presentation === "page";
  const handleStartCooking = () => {
    if (onStartCooking) {
      onStartCooking();
      return;
    }
    temporaryFeedback("Cook mode comes next.");
  };
  const handlePlanMeal = () => {
    if (onPlanMeal) {
      onPlanMeal();
      return;
    }
    temporaryFeedback("Planning this meal comes next.");
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

        {meal.servings != null ? (
          <RecipeServingsControl
            servings={meal.servings}
            durationLabel={durationLabel}
          />
        ) : durationLabel ? (
          <p className="text-14 text-graphite">{durationLabel}</p>
        ) : null}

        {meal.description ? (
          <p className="text-15 leading-6 text-graphite">{meal.description}</p>
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
          <Button
            type="button"
            variant="secondary"
            className="h-11 w-full border-0 font-semibold shadow-none"
            onClick={handlePlanMeal}
          >
            <CalendarPlus
              aria-hidden="true"
              className="size-4.5"
              strokeWidth={2}
            />
            Plan this meal
          </Button>
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
            {meal.ingredients.length}{" "}
            {meal.ingredients.length === 1 ? "item" : "items"}
          </p>
        </div>
        <ul>
          {meal.ingredients.map((line) => (
            <li
              key={line.id}
              className="flex min-h-11 items-start gap-3 border-b border-border py-2"
            >
              <span className="w-17.5 shrink-0 text-14 font-semibold text-ink">
                {formatIngredientAmount(line)}
              </span>
              <span className="min-w-0 flex-1 text-14 text-ink">
                {formatIngredientName(line)}
              </span>
            </li>
          ))}
        </ul>
      </section>

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
              {meal.steps.length} {meal.steps.length === 1 ? "step" : "steps"}
            </p>
          </div>
          {showPageActions ? (
            <button
              type="button"
              className="inline-flex h-7 items-center gap-1.5 text-13 font-semibold text-cadmium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cadmium"
              onClick={handleStartCooking}
            >
              <Play aria-hidden="true" className="size-4" strokeWidth={1.8} />
              Start cooking
            </button>
          ) : null}
        </div>

        <ol className="flex flex-col gap-3.5">
          {meal.steps.map((step, index) => (
            <li key={step.id} className="flex gap-3.5">
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
          ))}
        </ol>
      </section>
    </div>
  );
}
