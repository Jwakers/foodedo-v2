"use client";

import useEmblaCarousel from "embla-carousel-react";
import {
  ArrowRight,
  ChefHat,
  ChevronLeft,
  ChevronRight,
  Clock,
  Utensils,
} from "lucide-react";
import Image from "next/image";
import {
  useEffect,
  useRef,
  useSyncExternalStore,
  type KeyboardEvent,
} from "react";

import { Button, ButtonLink } from "@/components/ui/button";
import {
  formatMealDurationLabel,
  type ActivePlanMealSlot,
} from "@/lib/domain/plan-display";
import { formatRecipeHeading } from "@/lib/domain/recipe-headings";
import {
  getServerPlanMealSelection,
  readPlanMealSelection,
  subscribeToPlanMealSelection,
  writePlanMealSelection,
} from "@/lib/platform/plan-meal-selection-store";
import {
  personalRecipeCookPath,
  personalRecipeDetailPath,
  recipeCookPath,
  recipeDetailPath,
} from "@/lib/routing/recipes";
import { cn } from "@/lib/utils/cn";

function slotKey(meal: ActivePlanMealSlot) {
  return meal._id ?? meal.date;
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function positionThumbnail(viewport: HTMLUListElement | null, index: number) {
  const button = viewport?.querySelectorAll("button")[index];
  if (!viewport || !button) return;
  const inset = parseFloat(getComputedStyle(viewport).paddingLeft) || 0;
  // Align toward the start, naturally clamped at the last few meals. Only move
  // the strip, never the surrounding page, and retain the normal content inset.
  viewport.scrollTo({
    left:
      viewport.scrollLeft +
      button.getBoundingClientRect().left -
      viewport.getBoundingClientRect().left -
      inset,
    behavior: prefersReducedMotion() ? "instant" : "smooth",
  });
}

/** One selection drives the photo, recipe information and both entry points. */
export function PlanMealSelector({
  meals,
  servings,
  selectionKey,
}: {
  meals: readonly ActivePlanMealSlot[];
  servings: number;
  selectionKey: string;
}) {
  const savedSelection = useSyncExternalStore(
    subscribeToPlanMealSelection,
    () => readPlanMealSelection(selectionKey),
    getServerPlanMealSelection,
  );
  const selectedIndex = Math.max(
    0,
    meals.findIndex((meal) => slotKey(meal) === savedSelection),
  );
  const selected = meals[selectedIndex];
  const [photoRef, photoApi] = useEmblaCarousel({ loop: false });
  const thumbnailsRef = useRef<HTMLUListElement>(null);
  const multiple = meals.length > 1;

  useEffect(() => {
    if (!photoApi) return;
    const onSelect = () => {
      const meal = meals[photoApi.selectedScrollSnap()];
      if (meal) writePlanMealSelection(selectionKey, slotKey(meal));
    };
    // Resizing/slides changing must preserve the chosen slot, not its old index.
    const onReInit = () => {
      const key = readPlanMealSelection(selectionKey);
      const index = Math.max(
        0,
        meals.findIndex((meal) => slotKey(meal) === key),
      );
      photoApi.scrollTo(index, true);
    };
    photoApi.on("select", onSelect).on("reInit", onReInit);
    return () => {
      photoApi.off("select", onSelect).off("reInit", onReInit);
    };
  }, [photoApi, meals, selectionKey]);

  useEffect(() => {
    if (!selected) return;
    // A removed/unavailable selection falls back once; it cannot reappear and
    // silently take over the current choice when catalogue data recovers.
    if (savedSelection && savedSelection !== slotKey(selected))
      writePlanMealSelection(selectionKey, slotKey(selected));
    if (photoApi && photoApi.selectedScrollSnap() !== selectedIndex)
      photoApi.scrollTo(selectedIndex, true);

    positionThumbnail(thumbnailsRef.current, selectedIndex);
  }, [photoApi, selected, selectedIndex, savedSelection, selectionKey]);

  function selectMeal(index: number, animate = false) {
    const meal = meals[index];
    if (!meal) return;
    writePlanMealSelection(selectionKey, slotKey(meal));
    // Arrows slide between neighbours; direct thumbnail choices jump to their
    // photo so distant choices don't tour through all the intervening meals.
    photoApi?.scrollTo(index, !animate || prefersReducedMotion());
    if (index === selectedIndex)
      positionThumbnail(thumbnailsRef.current, index);
  }

  function navigate(event: KeyboardEvent, focusThumbnail = false) {
    const index =
      event.key === "ArrowRight"
        ? Math.min(meals.length - 1, selectedIndex + 1)
        : event.key === "ArrowLeft"
          ? Math.max(0, selectedIndex - 1)
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? meals.length - 1
              : null;
    if (index === null) return;
    event.preventDefault();
    selectMeal(
      index,
      !focusThumbnail &&
        (event.key === "ArrowRight" || event.key === "ArrowLeft"),
    );
    if (focusThumbnail)
      thumbnailsRef.current
        ?.querySelectorAll<HTMLButtonElement>("button")
        [index]?.focus({ preventScroll: true });
  }

  if (!selected) return null;
  const reference = {
    catalogueMealId: selected.catalogueMealId ?? undefined,
    catalogueVersion: selected.catalogueVersion ?? undefined,
  };
  const detailPath = selected.recipeId
    ? personalRecipeDetailPath(selected.recipeId, servings, servings)
    : recipeDetailPath(selected.catalogueMealSlug!, reference, servings);
  const cookPath = selected.recipeId
    ? personalRecipeCookPath(selected.recipeId, servings, servings)
    : recipeCookPath(selected.catalogueMealSlug!, servings, reference);
  const duration = formatMealDurationLabel(
    selected.prepMinutes ?? undefined,
    selected.cookMinutes ?? undefined,
  );

  return (
    <section
      aria-label="Meals in your plan"
      aria-roledescription="carousel"
      className="flex min-w-0 flex-col gap-2"
    >
      <div className="flex min-h-11 items-center justify-between gap-2">
        <h2 className="font-display text-22 leading-8 font-semibold tracking-title text-ink min-[390px]:text-26">
          What sounds good?
        </h2>
        <ButtonLink
          href="/week"
          variant="inline"
          className="h-11 shrink-0 text-leaf"
        >
          View plan <ArrowRight aria-hidden="true" className="size-3.5" />
        </ButtonLink>
      </div>

      <div className="relative">
        <div
          ref={photoRef}
          role="group"
          tabIndex={multiple ? 0 : undefined}
          aria-label="Meal photographs"
          onKeyDown={navigate}
          className="overflow-hidden rounded-media bg-mist focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cadmium"
        >
          <div className="flex [touch-action:pan-y_pinch-zoom]">
            {meals.map((meal, index) => (
              <div
                key={slotKey(meal)}
                aria-hidden={index !== selectedIndex}
                className="relative flex h-44 min-w-0 flex-[0_0_100%] items-center justify-center sm:h-80"
              >
                {meal.imageSrc ? (
                  <Image
                    src={meal.imageSrc}
                    alt=""
                    fill
                    preload={index === 0}
                    sizes="(min-width: 736px) 700px, calc(100vw - 40px)"
                    className="object-cover"
                  />
                ) : (
                  <Utensils
                    aria-hidden="true"
                    className="size-10 text-graphite"
                  />
                )}
              </div>
            ))}
          </div>
        </div>
        {multiple ? (
          <>
            <Button
              variant="inline"
              size="headerIcon"
              aria-label="Previous meal"
              disabled={selectedIndex === 0}
              onClick={() => selectMeal(selectedIndex - 1, true)}
              className="absolute top-1/2 left-2.5 -translate-y-1/2 disabled:opacity-50"
            >
              <span className="flex size-8 items-center justify-center rounded-full bg-paper/90 text-ink">
                <ChevronLeft aria-hidden="true" className="size-4.5" />
              </span>
            </Button>
            <Button
              variant="inline"
              size="headerIcon"
              aria-label="Next meal"
              disabled={selectedIndex === meals.length - 1}
              onClick={() => selectMeal(selectedIndex + 1, true)}
              className="absolute top-1/2 right-2.5 -translate-y-1/2 disabled:opacity-50"
            >
              <span className="flex size-8 items-center justify-center rounded-full bg-paper/90 text-ink">
                <ChevronRight aria-hidden="true" className="size-4.5" />
              </span>
            </Button>
          </>
        ) : null}
      </div>

      {multiple ? (
        <ul
          ref={thumbnailsRef}
          aria-label="Choose a planned meal"
          onKeyDown={(event) => navigate(event, true)}
          className="-mx-page-inline flex gap-2 overflow-x-auto overscroll-x-contain px-page-inline py-0.5 scrollbar-none sm:mx-0 sm:px-0"
        >
          {meals.map((meal, index) => (
            <li key={slotKey(meal)} className="w-32 shrink-0">
              <button
                type="button"
                aria-pressed={index === selectedIndex}
                aria-label={formatRecipeHeading(meal.title)}
                onClick={() => selectMeal(index)}
                className="flex h-27 w-full flex-col gap-1 rounded-sm text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-cadmium"
              >
                <span
                  className={cn(
                    "flex h-17 w-full shrink-0 rounded-xl border-2 p-0.75",
                    index === selectedIndex
                      ? "border-leaf"
                      : "border-transparent",
                  )}
                >
                  <span className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-[7px] bg-mist">
                    {meal.imageSrc ? (
                      <Image
                        src={meal.imageSrc}
                        alt=""
                        fill
                        sizes="118px"
                        className="object-cover"
                      />
                    ) : (
                      <Utensils
                        aria-hidden="true"
                        className="size-5 text-graphite"
                      />
                    )}
                  </span>
                </span>
                <span
                  className={cn(
                    "line-clamp-2 h-9 w-full text-14 leading-4.5 text-ink",
                    index === selectedIndex ? "font-bold" : "font-medium",
                  )}
                >
                  {formatRecipeHeading(meal.title)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex min-w-0 flex-col gap-1">
        <h3
          aria-live="polite"
          aria-atomic="true"
          className="font-display text-26 leading-7.5 font-semibold tracking-title break-words text-ink"
        >
          {formatRecipeHeading(selected.title)}
        </h3>
        <p className="flex items-center gap-2 text-13 leading-5 text-graphite">
          {duration ? (
            <>
              <Clock aria-hidden="true" className="size-4" />
              <span>{duration}</span>
              <span aria-hidden="true">·</span>
            </>
          ) : null}
          <span>Serves {servings}</span>
        </p>
        {selected.description?.trim() ? (
          <p className="line-clamp-2 h-10 text-14 leading-5 text-graphite">
            {selected.description}
          </p>
        ) : null}
      </div>
      <div className="flex items-center gap-2.5">
        <ButtonLink
          href={cookPath}
          className="min-w-0 flex-1 px-2 sm:min-w-58 sm:flex-none sm:px-page-inline"
        >
          Cook this meal{" "}
          <ChefHat aria-hidden="true" className="size-4.5 shrink-0" />
        </ButtonLink>
        <ButtonLink
          href={detailPath}
          variant="inline"
          className="h-12 w-27 shrink-0 justify-center text-14 font-semibold text-leaf"
        >
          View recipe <ArrowRight aria-hidden="true" className="size-3.5" />
        </ButtonLink>
      </div>
    </section>
  );
}
