"use client";

import { DrawerBody } from "@/components/ui/drawer";
import { useDrawerStack } from "@/components/ui/drawer-stack";
import { DrawerStackHeader } from "@/components/ui/drawer-stack-header";
import type { RecipeSort } from "@/lib/domain/recipe-filtering";

const sortOptions: ReadonlyArray<{
  value: RecipeSort;
  title: string;
  description: string;
}> = [
  {
    value: "recommended",
    title: "Recommended",
    description: "Best match for this plan",
  },
  {
    value: "quickest",
    title: "Quickest first",
    description: "Shorter cooking times",
  },
  {
    value: "lowest-cost",
    title: "Lowest cost first",
    description: "Lower estimated ingredient cost",
  },
];

export function recipeSortLabel(sort: RecipeSort) {
  return (
    sortOptions.find((option) => option.value === sort)?.title ?? "Recommended"
  );
}

/** Shared Paper-style sort screen used anywhere recipes can be ordered. */
export function RecipeSortStackPane({
  sort,
  onChange,
}: {
  sort: RecipeSort;
  onChange: (sort: RecipeSort) => void;
}) {
  const { pop } = useDrawerStack();

  return (
    <>
      <DrawerStackHeader title="Sort recipes" closeLabel="Close recipe sort" />
      <DrawerBody className="px-page-inline pt-2.5">
        <p className="pb-4.5 text-14 text-graphite">
          Choose how Foodedo orders your matches.
        </p>
        <div
          role="radiogroup"
          aria-label="Sort recipes"
          className="border-y border-border"
        >
          {sortOptions.map((option) => {
            const selected = sort === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                className="flex min-h-18.5 w-full items-center justify-between border-b border-border text-left last:border-b-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cadmium"
                onClick={() => {
                  onChange(option.value);
                  pop();
                }}
              >
                <span className="flex flex-col gap-0.75">
                  <span className="text-16 font-semibold text-ink">
                    {option.title}
                  </span>
                  <span className="text-13 text-graphite">
                    {option.description}
                  </span>
                </span>
                <span
                  aria-hidden="true"
                  className={
                    selected
                      ? "flex size-5.5 items-center justify-center rounded-full bg-ink after:size-1.75 after:rounded-full after:bg-paper"
                      : "size-5.5 rounded-full border border-control-muted"
                  }
                />
              </button>
            );
          })}
        </div>
      </DrawerBody>
    </>
  );
}
