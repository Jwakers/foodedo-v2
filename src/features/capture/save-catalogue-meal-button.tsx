"use client";

import { useCatalogueSaveState } from "./catalogue-save-state";

const isSaveConfigured = Boolean(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() &&
  process.env.NEXT_PUBLIC_CONVEX_URL?.trim(),
);
const buttonClassName =
  "inline-flex min-h-11 items-center justify-center rounded-full border border-foreground px-5 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-foreground hover:text-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground disabled:cursor-not-allowed disabled:border-border disabled:text-muted-foreground disabled:hover:bg-transparent disabled:hover:text-muted-foreground";

export function SaveCatalogueMealButton({
  catalogueMealId,
}: {
  catalogueMealId: string;
  catalogueVersion: number;
}) {
  if (!isSaveConfigured) {
    return (
      <button type="button" className={buttonClassName} disabled>
        Saving unavailable
      </button>
    );
  }

  return <ConfiguredSaveButton catalogueMealId={catalogueMealId} />;
}

function ConfiguredSaveButton({
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
      <button
        type="button"
        className={buttonClassName}
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
      </button>

      <p
        className={`min-h-5 text-sm ${hasError ? "text-danger" : "text-muted-foreground"}`}
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
