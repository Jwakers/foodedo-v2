"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DrawerBody, DrawerFooter } from "@/components/ui/drawer";
import {
  type RecipeFilters,
  type RecipeSort,
} from "@/lib/domain/recipe-filtering";
import type { ProteinCategory } from "@/lib/domain/recipes";
import { recipeSortLabel } from "@/features/recipes/recipe-sort-stack-pane";

const matterChips = [
  { label: "Under 30 min", key: "under30Minutes" },
  { label: "Budget friendly", key: "budgetFriendly" },
] as const;

const proteinChips: ReadonlyArray<{
  label: string;
  value: ProteinCategory;
}> = [
  { label: "Chicken", value: "chicken" },
  { label: "Beef", value: "beef" },
  { label: "Pork", value: "pork" },
  { label: "Lamb", value: "lamb" },
  { label: "Fish", value: "fish" },
  { label: "Meat-free", value: "meat-free" },
];

/**
 * Shared filter body + footer used by meal-swap (drawer stack) and the
 * recipes listing (standalone drawer).
 */
export function RecipeFilterPanel({
  filters,
  sort,
  onOpenSort,
  getMatchCount,
  description,
  onApply,
}: {
  filters: RecipeFilters;
  sort: RecipeSort;
  onOpenSort: () => void;
  getMatchCount: (filters: RecipeFilters) => number;
  /** Context-specific lead-in; required so swap vs browse copy stays intentional. */
  description: string;
  onApply: (filters: RecipeFilters) => void;
}) {
  const [draftFilters, setDraftFilters] = useState(filters);
  const [prevFilters, setPrevFilters] = useState(filters);
  if (filters !== prevFilters) {
    setPrevFilters(filters);
    setDraftFilters(filters);
  }

  const matchCount = getMatchCount(draftFilters);

  return (
    <>
      <DrawerBody className="flex min-h-0 flex-1 flex-col gap-4 pt-2.5 pb-4">
        <p className="shrink-0 text-14 text-graphite">{description}</p>

        <div className="flex shrink-0 flex-col gap-2.5">
          <h3 className="font-display text-22 font-semibold tracking-title text-ink">
            What matters for this meal?
          </h3>
          <FilterChipGroup
            labels={matterChips}
            selected={(chip) => draftFilters[chip.key]}
            onToggle={(chip) => {
              setDraftFilters((current) => ({
                ...current,
                [chip.key]: !current[chip.key],
              }));
            }}
          />
        </div>

        <div className="flex shrink-0 flex-col gap-4">
          <div className="flex flex-col gap-2.5">
            <p className="text-11 font-semibold tracking-label text-graphite uppercase">
              Protein
            </p>
            <FilterChipGroup
              labels={proteinChips}
              selected={(chip) =>
                draftFilters.proteinCategories.includes(chip.value)
              }
              onToggle={(chip) => {
                setDraftFilters((current) => ({
                  ...current,
                  proteinCategories: toggleValue(
                    current.proteinCategories,
                    chip.value,
                  ),
                }));
              }}
            />
          </div>

          <Button
            variant="ghost"
            className="h-13 w-full justify-between rounded-none border-y border-border bg-paper px-0 text-left font-normal hover:bg-paper"
            onClick={onOpenSort}
          >
            <span className="text-14 font-semibold text-ink">Sort by</span>
            <span className="flex items-center gap-2 text-13 text-graphite">
              {recipeSortLabel(sort)}
              <ChevronRight
                aria-hidden="true"
                className="size-4"
                strokeWidth={2}
              />
            </span>
          </Button>
        </div>
      </DrawerBody>

      <DrawerFooter>
        <Button
          className="w-full"
          onClick={() => {
            onApply(draftFilters);
          }}
        >
          Show {matchCount} {matchCount === 1 ? "recipe" : "recipes"}
        </Button>
      </DrawerFooter>
    </>
  );
}

function FilterChipGroup<T extends { label: string }>({
  labels,
  selected,
  onToggle,
}: {
  labels: ReadonlyArray<T>;
  selected: (chip: T) => boolean;
  onToggle: (chip: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {labels.map((label) => (
        <Button
          key={label.label}
          variant="filter"
          aria-pressed={selected(label)}
          onClick={() => onToggle(label)}
        >
          {label.label}
        </Button>
      ))}
    </div>
  );
}

function toggleValue<T>(current: ReadonlyArray<T>, value: T): T[] {
  return current.includes(value)
    ? current.filter((item) => item !== value)
    : [...current, value];
}
