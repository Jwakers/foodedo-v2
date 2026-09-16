"use client";

import { ChevronDown, Minus, Plus } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

/**
 * Servings disclosure UI only — does not scale ingredient quantities yet.
 */
export function RecipeServingsControl({
  servings,
  durationLabel,
  className,
}: {
  servings: number;
  durationLabel?: string | null;
  className?: string;
}) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [displayServings, setDisplayServings] = useState(servings);
  const [prevServings, setPrevServings] = useState(servings);
  if (servings !== prevServings) {
    setPrevServings(servings);
    setDisplayServings(servings);
  }

  return (
    <div className={cn("flex flex-col gap-2.5", className)}>
      <div className="flex flex-wrap items-center text-14 leading-5 text-graphite">
        {durationLabel ? <span>{durationLabel}&nbsp;·&nbsp;</span> : null}
        <Button
          variant="inline"
          className="h-auto gap-1 text-14 font-medium"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
        >
          Serves {displayServings}
          <ChevronDown
            aria-hidden="true"
            className={cn(
              "size-3.5 transition-transform",
              open && "rotate-180",
            )}
            strokeWidth={1.8}
          />
        </Button>
      </div>

      {open ? (
        <div
          id={panelId}
          className="flex items-center justify-between border-y border-border py-1.5"
        >
          <div className="flex flex-col gap-0.5">
            <p className="text-14 font-semibold text-ink">Servings</p>
            <p className="text-11 text-graphite">Quantity scaling comes next</p>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant="counter"
              className="rounded-surface"
              aria-label="Decrease servings"
              disabled={displayServings <= 1}
              onClick={() => {
                setDisplayServings((value) => Math.max(1, value - 1));
              }}
            >
              <Minus aria-hidden="true" className="size-4" strokeWidth={2} />
            </Button>
            <span
              className="min-w-4.5 text-center text-16 font-semibold text-ink"
              aria-live="polite"
            >
              {displayServings}
            </span>
            <Button
              variant="counter"
              className="rounded-surface"
              aria-label="Increase servings"
              onClick={() => {
                setDisplayServings((value) => value + 1);
              }}
            >
              <Plus aria-hidden="true" className="size-4" strokeWidth={2} />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
