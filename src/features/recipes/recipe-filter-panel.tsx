"use client";

import { Check, ChevronRight } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { DrawerBody, DrawerFooter } from "@/components/ui/drawer";
import { temporaryFeedback } from "@/lib/ui/temporary-feedback";

const matterChips = ["Budget friendly", "Under 30 min"] as const;
const proteinChips = ["Chicken", "Beef", "Fish", "Meat-free"] as const;

/** Browse-bar chips that open the full filter drawer (Paper §08 / §03). */
export const recipeQuickFilterLabels = ["Under 30 min", "Meat-free"] as const;

/**
 * Shared filter body + footer used by meal-swap (drawer stack) and the
 * recipes listing (standalone drawer). Apply/sort remain temporary stubs.
 */
export function RecipeFilterPanel({
  matchCount,
  description,
  onApply,
}: {
  matchCount: number;
  /** Context-specific lead-in; required so swap vs browse copy stays intentional. */
  description: string;
  onApply: () => void;
}) {
  const [matters, setMatters] = useState<string[]>([]);
  const [proteins, setProteins] = useState<string[]>([]);

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
            selected={matters}
            onToggle={(label) => {
              setMatters((current) => toggleLabel(current, label));
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
              selected={proteins}
              onToggle={(label) => {
                setProteins((current) => toggleLabel(current, label));
              }}
            />
          </div>

          <button
            type="button"
            className="flex h-13 w-full items-center justify-between border-y border-border text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cadmium"
            onClick={() => {
              temporaryFeedback("Sort options come next.");
            }}
          >
            <span className="text-14 font-semibold text-ink">Sort by</span>
            <span className="flex items-center gap-2 text-13 text-graphite">
              Recommended
              <ChevronRight
                aria-hidden="true"
                className="size-4"
                strokeWidth={2}
              />
            </span>
          </button>

          <div className="flex items-center gap-2.5">
            <Check
              aria-hidden="true"
              className="size-4 shrink-0 text-leaf"
              strokeWidth={2}
            />
            <p className="text-11 text-leaf">
              Your dietary preferences are already applied
            </p>
          </div>
        </div>
      </DrawerBody>

      <DrawerFooter>
        <Button
          className="w-full"
          onClick={() => {
            temporaryFeedback(
              "Applying filters comes next. Showing all matches for now.",
            );
            onApply();
          }}
        >
          Show {matchCount} {matchCount === 1 ? "recipe" : "recipes"}
        </Button>
      </DrawerFooter>
    </>
  );
}

function FilterChipGroup({
  labels,
  selected,
  onToggle,
}: {
  labels: readonly string[];
  selected: readonly string[];
  onToggle: (label: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {labels.map((label) => (
        <Button
          key={label}
          variant="filter"
          aria-pressed={selected.includes(label)}
          onClick={() => onToggle(label)}
        >
          {label}
        </Button>
      ))}
    </div>
  );
}

function toggleLabel(current: string[], label: string) {
  return current.includes(label)
    ? current.filter((item) => item !== label)
    : [...current, label];
}
