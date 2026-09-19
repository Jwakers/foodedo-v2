"use client";

import { ChevronRight, Ellipsis, Minus, Plus } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerTrigger } from "@/components/ui/drawer";
import {
  DrawerStack,
  DrawerStackView,
  useDrawerStack,
} from "@/components/ui/drawer-stack";
import { PlanMealActions } from "@/features/plan/plan-meal-actions";
import { planMealDrawerViews } from "@/features/plan/plan-meal-drawer";
import { PlanMealFilters } from "@/features/plan/plan-meal-filters";
import { PlanMealRecipePreview } from "@/features/plan/plan-meal-recipe-preview";
import { PlanMealSwap } from "@/features/plan/plan-meal-swap";
import { RecipeSortStackPane } from "@/features/recipes/recipe-sort-stack-pane";
import {
  useCatalogueMeal,
  useCurrentCatalogue,
} from "@/features/recipes/use-catalogue";
import type { GuestPlanMealRow } from "@/lib/domain/plan-display";
import { useRecipeFilters } from "@/features/recipes/use-recipe-filters";
import {
  type RecipeFilters,
  type RecipeSort,
} from "@/lib/domain/recipe-filtering";
import { markUnfinishedInteraction } from "@/lib/ui/unfinished-interaction";

export function PlanMealRow({
  row,
  onRemoveMeal,
  onReplaceMeal,
  readOnly = false,
  recipeHref,
}: {
  row: GuestPlanMealRow;
  onRemoveMeal?: (date: string) => Promise<unknown> | void;
  onReplaceMeal?: (
    date: string,
    catalogueMealId: string,
  ) => Promise<unknown> | void;
  readOnly?: boolean;
  recipeHref?: string;
}) {
  if (row.kind === "empty") {
    return (
      <div className="flex min-h-21.5 items-center gap-2.5 border-b border-border py-2.5">
        <PlanDayLabel weekday={row.weekday} dayOfMonth={row.dayOfMonth} />

        <div className="flex h-16.5 w-20.5 shrink-0 items-center justify-center rounded-sm bg-leaf-soft text-leaf">
          {readOnly ? (
            <Minus aria-hidden="true" className="size-6" strokeWidth={1.7} />
          ) : (
            <Plus aria-hidden="true" className="size-6" strokeWidth={1.7} />
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="font-display text-16 font-semibold tracking-card text-ink">
            No meal planned
          </p>
          <p className="text-11 text-graphite">
            {readOnly ? "Left free" : "Leave it free or add a meal"}
          </p>
        </div>

        {readOnly || !onReplaceMeal ? null : (
          <PlanMealActionsDrawer
            date={row.date}
            mealTitle="Add a meal"
            onReplaceMeal={onReplaceMeal}
            trigger={
              <Button type="button" variant="leaf" size="chip">
                Add meal
              </Button>
            }
          />
        )}
      </div>
    );
  }

  return (
    <PlannedMealRow
      row={row}
      onRemoveMeal={onRemoveMeal}
      onReplaceMeal={onReplaceMeal}
      readOnly={readOnly}
      recipeHref={recipeHref}
    />
  );
}

function PlannedMealRow({
  row,
  onRemoveMeal,
  onReplaceMeal,
  readOnly,
  recipeHref,
}: {
  row: Extract<GuestPlanMealRow, { kind: "planned" }>;
  onRemoveMeal?: (date: string) => Promise<unknown> | void;
  onReplaceMeal?: (
    date: string,
    catalogueMealId: string,
  ) => Promise<unknown> | void;
  readOnly: boolean;
  recipeHref?: string;
}) {
  const summary = (
    <>
      <div className="relative h-16.5 w-20.5 shrink-0 overflow-hidden rounded-sm bg-mist">
        {row.meal.imageSrc ? (
          <Image
            src={row.meal.imageSrc}
            alt=""
            fill
            sizes="82px"
            className="object-cover"
          />
        ) : null}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="truncate font-display text-18 font-semibold tracking-card text-ink">
          {row.meal.title}
        </p>
        {row.durationLabel ? (
          <p className="flex items-center gap-1 text-12 text-graphite">
            {row.durationLabel}
            {recipeHref ? (
              <ChevronRight
                aria-hidden="true"
                className="size-4 shrink-0"
                strokeWidth={1.8}
              />
            ) : null}
          </p>
        ) : recipeHref ? (
          <p className="flex items-center gap-1 text-12 text-graphite">
            View recipe
            <ChevronRight
              aria-hidden="true"
              className="size-4 shrink-0"
              strokeWidth={1.8}
            />
          </p>
        ) : null}
      </div>
    </>
  );

  return (
    <div className="flex min-h-21.5 items-center gap-2.5 border-b border-border py-2.5">
      <PlanDayLabel weekday={row.weekday} dayOfMonth={row.dayOfMonth} />

      {recipeHref ? (
        <Link
          href={recipeHref}
          aria-label={`View ${row.meal.title} recipe`}
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-sm text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cadmium"
        >
          {summary}
        </Link>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          {summary}
        </div>
      )}

      {readOnly ? null : (
        <PlanMealActionsDrawer
          date={row.date}
          mealTitle={row.meal.title}
          currentMeal={row.meal}
          onRemoveMeal={onRemoveMeal}
          onReplaceMeal={onReplaceMeal}
          trigger={
            <Button
              type="button"
              variant="quiet"
              size="icon"
              aria-label={`Actions for ${row.meal.title}`}
            >
              <Ellipsis aria-hidden="true" className="size-4" strokeWidth={2} />
            </Button>
          }
        />
      )}
    </div>
  );
}

function PlanMealActionsDrawer({
  date,
  mealTitle,
  currentMeal,
  onRemoveMeal,
  onReplaceMeal,
  trigger,
}: {
  date: string;
  mealTitle: string;
  currentMeal?: Extract<GuestPlanMealRow, { kind: "planned" }>["meal"];
  onRemoveMeal?: (date: string) => Promise<unknown> | void;
  onReplaceMeal?: (
    date: string,
    catalogueMealId: string,
  ) => Promise<unknown> | void;
  trigger: ReactNode;
}) {
  const catalogue = useCurrentCatalogue();
  const [open, setOpen] = useState(false);
  const [stackKey, setStackKey] = useState(0);
  const [isRemoving, setIsRemoving] = useState(false);
  const [isSwapping, setIsSwapping] = useState(false);
  const [previewMealId, setPreviewMealId] = useState<string | null>(null);
  const {
    filters: recipeFilters,
    sort: recipeSort,
    setFilters: setRecipeFilters,
    setSort: setRecipeSort,
  } = useRecipeFilters();

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setStackKey((value) => value + 1);
      setPreviewMealId(null);
    }
  }, []);

  const previewMeal = useCatalogueMeal(
    previewMealId,
    catalogue?.meals.find((meal) => meal.id === previewMealId)?.version ?? null,
  );
  const candidates = (catalogue?.meals ?? []).filter(
    (meal) => meal.id !== currentMeal?.id,
  );

  const runSwap = useCallback(
    (catalogueMealId: string) => {
      if (!onReplaceMeal || isSwapping) return;
      void (async () => {
        setIsSwapping(true);
        try {
          await onReplaceMeal(date, catalogueMealId);
          setOpen(false);
        } catch (error) {
          console.error("Failed to swap guest plan meal.", error);
          toast.error(
            "Foodedo couldn't swap that meal. Check storage access and try again.",
          );
        } finally {
          setIsSwapping(false);
        }
      })();
    },
    [date, isSwapping, onReplaceMeal],
  );

  return (
    <Drawer open={open} onOpenChange={handleOpenChange}>
      <DrawerTrigger asChild>{trigger}</DrawerTrigger>
      <DrawerContent className="max-h-[min(92dvh,52rem)]">
        <DrawerStack key={stackKey} rootId={planMealDrawerViews.actions}>
          <DrawerStackView id={planMealDrawerViews.actions} layout="hug">
            <MealActionsPane
              mealTitle={mealTitle}
              isRemoving={isRemoving}
              onChooseForMe={() => {
                setOpen(false);
                markUnfinishedInteraction("Choosing for you comes next.");
              }}
              onRemove={
                onRemoveMeal
                  ? () => {
                      if (isRemoving) return;
                      void (async () => {
                        setIsRemoving(true);
                        setOpen(false);
                        try {
                          await onRemoveMeal(date);
                        } catch (error) {
                          console.error(
                            "Failed to remove guest plan meal.",
                            error,
                          );
                          toast.error(
                            "Foodedo couldn’t remove that meal. Check storage access and try again.",
                          );
                        } finally {
                          setIsRemoving(false);
                        }
                      })();
                    }
                  : undefined
              }
            />
          </DrawerStackView>

          <DrawerStackView id={planMealDrawerViews.swap} layout="fill">
            <SwapPane
              date={date}
              currentMeal={currentMeal}
              isSwapping={isSwapping}
              filters={recipeFilters}
              sort={recipeSort}
              onFiltersChange={setRecipeFilters}
              onSwap={runSwap}
              onOpenPreview={setPreviewMealId}
            />
          </DrawerStackView>

          <DrawerStackView id={planMealDrawerViews.filters} layout="hug">
            <PlanMealFilters
              meals={candidates}
              filters={recipeFilters}
              sort={recipeSort}
              onApply={(filters, sort) => {
                setRecipeFilters(filters);
                setRecipeSort(sort);
              }}
            />
          </DrawerStackView>

          <DrawerStackView id={planMealDrawerViews.sort} layout="hug">
            <RecipeSortStackPane sort={recipeSort} onChange={setRecipeSort} />
          </DrawerStackView>

          <DrawerStackView id={planMealDrawerViews.preview} layout="fill">
            {previewMeal ? (
              <PlanMealRecipePreview
                meal={previewMeal}
                isSwapping={isSwapping}
                onSwap={() => runSwap(previewMeal.id)}
              />
            ) : null}
          </DrawerStackView>
        </DrawerStack>
      </DrawerContent>
    </Drawer>
  );
}

function MealActionsPane({
  mealTitle,
  isRemoving,
  onChooseForMe,
  onRemove,
}: {
  mealTitle: string;
  isRemoving: boolean;
  onChooseForMe: () => void;
  onRemove?: () => void;
}) {
  const { push } = useDrawerStack();

  return (
    <PlanMealActions
      mealTitle={mealTitle}
      isRemoving={isRemoving}
      onChooseRecipe={() => push(planMealDrawerViews.swap)}
      onChooseForMe={onChooseForMe}
      onRemove={onRemove}
    />
  );
}

function SwapPane({
  date,
  currentMeal,
  isSwapping,
  filters,
  sort,
  onFiltersChange,
  onSwap,
  onOpenPreview,
}: {
  date: string;
  currentMeal?: Extract<GuestPlanMealRow, { kind: "planned" }>["meal"];
  isSwapping: boolean;
  filters: RecipeFilters;
  sort: RecipeSort;
  onFiltersChange: (filters: RecipeFilters) => void;
  onSwap: (catalogueMealId: string) => void;
  onOpenPreview: (catalogueMealId: string) => void;
}) {
  const { push } = useDrawerStack();

  return (
    <PlanMealSwap
      date={date}
      currentMeal={currentMeal}
      isSwapping={isSwapping}
      filters={filters}
      sort={sort}
      onFiltersChange={onFiltersChange}
      onSwap={onSwap}
      onOpenPreview={(catalogueMealId) => {
        onOpenPreview(catalogueMealId);
        push(planMealDrawerViews.preview);
      }}
    />
  );
}

function PlanDayLabel({
  weekday,
  dayOfMonth,
}: {
  weekday: string;
  dayOfMonth: string;
}) {
  return (
    <div className="flex w-9 shrink-0 flex-col gap-0.75">
      <span className="text-10 font-bold tracking-label text-graphite">
        {weekday}
      </span>
      <span className="font-display text-18 font-semibold text-ink">
        {dayOfMonth}
      </span>
    </div>
  );
}
