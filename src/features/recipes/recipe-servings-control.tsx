"use client";

import { ChevronDown, Minus, Plus } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

export function RecipeServingsControl({
  servings,
  onServingsChange,
  durationLabel,
  className,
}: {
  servings: number;
  onServingsChange: (servings: number) => void;
  durationLabel?: string | null;
  className?: string;
}) {
  const panelId = useId();
  const [open, setOpen] = useState(false);

  return (
    <div className={cn("flex flex-col gap-2.5", className)}>
      <div className="flex flex-wrap items-center text-14 leading-5 text-graphite">
        {durationLabel ? <span>{durationLabel}&nbsp;·&nbsp;</span> : null}
        <Button
          variant="inline"
          className="min-h-11 gap-1 px-1 text-14 font-medium"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
        >
          Serves {servings}
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
            <p className="text-11 text-graphite">
              Ingredient quantities update automatically
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant="counter"
              className="rounded-surface"
              aria-label="Decrease servings"
              disabled={servings <= 1}
              onClick={() => {
                onServingsChange(Math.max(1, servings - 1));
              }}
            >
              <Minus aria-hidden="true" className="size-4" strokeWidth={2} />
            </Button>
            <span
              className="min-w-4.5 text-center text-16 font-semibold text-ink"
              aria-live="polite"
            >
              {servings}
            </span>
            <Button
              variant="counter"
              className="rounded-surface"
              aria-label="Increase servings"
              disabled={servings >= 1_000}
              onClick={() => {
                onServingsChange(Math.min(1_000, servings + 1));
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
