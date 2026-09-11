"use client";

import { EllipsisVertical, Share } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { temporaryFeedback } from "@/lib/ui/temporary-feedback";
import { cn } from "@/lib/utils/cn";

export function RecipeOverflowMenu({
  recipeTitle,
  className,
}: {
  recipeTitle: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  const focusTrigger = () => {
    rootRef.current
      ?.querySelector<HTMLButtonElement>('button[aria-label="Recipe options"]')
      ?.focus();
  };

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      focusTrigger();
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <Button
        type="button"
        variant="ghost"
        size="headerIcon"
        aria-label="Recipe options"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <EllipsisVertical aria-hidden="true" className="size-5" strokeWidth={2} />
      </Button>

      {open ? (
        <div
          id={panelId}
          className="absolute top-full right-0 z-50 mt-1 min-w-44 rounded-md border border-border bg-paper py-1 shadow-sm"
        >
          <button
            type="button"
            className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-14 font-semibold text-ink hover:bg-mist focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-cadmium"
            onClick={() => {
              setOpen(false);
              temporaryFeedback(`Sharing “${recipeTitle}” comes next.`);
              focusTrigger();
            }}
          >
            <Share aria-hidden="true" className="size-4" strokeWidth={2} />
            Share
          </button>
        </div>
      ) : null}
    </div>
  );
}
