"use client";

import { Heart } from "lucide-react";
import { formatRecipeHeading } from "@/lib/domain/recipe-headings";
import { cn } from "@/lib/utils/cn";

export type RecipeSaveControl = {
  saved: boolean;
  isSaveDisabled?: boolean;
  onToggleSave: () => Promise<unknown> | void;
};

export function RecipeSaveButton({
  title,
  saved,
  isSaveDisabled = false,
  onToggleSave,
  compact = false,
}: RecipeSaveControl & { title: string; compact?: boolean }) {
  return (
    <button
      type="button"
      aria-label={
        saved
          ? `Unsave ${formatRecipeHeading(title)}`
          : `Save ${formatRecipeHeading(title)}`
      }
      aria-pressed={saved}
      disabled={isSaveDisabled}
      className={cn(
        "absolute top-1.5 right-1.5 z-10 flex size-11 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cadmium disabled:opacity-70",
        compact &&
          "size-8 before:absolute before:-inset-1.5 before:rounded-full",
        saved
          ? "bg-cadmium-soft text-cadmium"
          : "border border-paper bg-mist text-ink",
      )}
      onClick={() => {
        void onToggleSave();
      }}
    >
      <Heart
        aria-hidden="true"
        className={cn("size-4.5", saved && "fill-current")}
        strokeWidth={1.8}
      />
    </button>
  );
}
