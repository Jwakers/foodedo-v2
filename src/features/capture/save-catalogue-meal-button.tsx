"use client";

import { useCatalogueSaveState } from "./catalogue-save-state";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

export function SaveCatalogueMealButton({
  catalogueMealId,
}: {
  catalogueMealId: string;
}) {
  const saveState = useCatalogueSaveState();
  const isSaved = saveState.savedMealIds.has(catalogueMealId);
  const isPending = saveState.pendingMealId === catalogueMealId;
  const failure =
    saveState.failure !== null &&
    (saveState.failure.catalogueMealId === catalogueMealId ||
      (saveState.failure.catalogueMealId === null &&
        saveState.failure.reason === "storage"))
      ? saveState.failure
      : null;
  const isUnavailable = failure?.reason === "catalogue_unsupported";
  const hasError = failure !== null;
  const isSaveInFlight = isPending && saveState.isSignedIn && !hasError;

  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        variant="secondary"
        disabled={
          saveState.isLoading || isSaveInFlight || isSaved || isUnavailable
        }
        onClick={() => void saveState.requestSave(catalogueMealId)}
      >
        {isSaved
          ? "Saved"
          : isUnavailable
            ? "Recipe unavailable"
            : isPending && saveState.isSignedIn && !hasError
              ? "Saving…"
              : hasError
                ? "Try saving again"
                : isPending
                  ? "Continue sign in"
                  : saveState.isSignedIn
                    ? "Save recipe"
                    : "Sign in to save"}
      </Button>

      <p
        className={cn(
          "min-h-5 text-sm",
          hasError ? "text-danger" : "text-muted-foreground",
        )}
        aria-live="polite"
      >
        {hasError
          ? failure.reason === "catalogue_unsupported"
            ? "This recipe version is no longer available to save."
            : failure.reason === "storage"
              ? "The save could not be stored safely. Please try again."
              : "The recipe was not saved. Please try again."
          : isSaved
            ? "Saved to your recipes."
            : ""}
      </p>
    </div>
  );
}
