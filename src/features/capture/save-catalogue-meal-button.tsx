"use client";

import {
  ClerkFailed,
  ClerkLoaded,
  ClerkLoading,
  Show,
  SignInButton,
} from "@clerk/react";
import { useConvexAuth, useMutation } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";

const isSaveConfigured = Boolean(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() &&
  process.env.NEXT_PUBLIC_CONVEX_URL?.trim(),
);

const buttonClassName =
  "inline-flex min-h-11 items-center justify-center rounded-full border border-[var(--ink)] px-5 py-2 text-sm font-semibold text-[var(--ink)] transition-colors hover:bg-[var(--ink)] hover:text-[var(--paper)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)] disabled:cursor-not-allowed disabled:border-[var(--line)] disabled:text-[var(--muted)] disabled:hover:bg-transparent disabled:hover:text-[var(--muted)]";

type SaveState = "idle" | "saving" | "saved" | "existing" | "error";

export function SaveCatalogueMealButton({
  catalogueMealId,
  catalogueVersion,
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

  return (
    <ConfiguredSaveButton
      catalogueMealId={catalogueMealId}
      catalogueVersion={catalogueVersion}
    />
  );
}

function ConfiguredSaveButton({
  catalogueMealId,
  catalogueVersion,
}: {
  catalogueMealId: string;
  catalogueVersion: number;
}) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const saveCatalogueMeal = useMutation(api.recipes.saveCatalogueMeal);
  const [state, setState] = useState<SaveState>("idle");

  async function save() {
    setState("saving");

    try {
      const result = await saveCatalogueMeal({
        catalogueMealId,
        catalogueVersion,
      });
      setState(result.created ? "saved" : "existing");
    } catch {
      setState("error");
    }
  }

  const completed = state === "saved" || state === "existing";

  return (
    <div className="flex flex-col items-start gap-2">
      <ClerkLoading>
        <button type="button" className={buttonClassName} disabled>
          Loading…
        </button>
      </ClerkLoading>

      <ClerkFailed>
        <p className="text-sm text-[var(--error)]" role="alert">
          Sign in is unavailable. Please try again.
        </p>
      </ClerkFailed>

      <ClerkLoaded>
        <Show when="signed-out">
          <SignInButton mode="modal">
            <button type="button" className={buttonClassName}>
              Sign in to save
            </button>
          </SignInButton>
        </Show>

        <Show when="signed-in">
          <button
            type="button"
            className={buttonClassName}
            disabled={
              isLoading || !isAuthenticated || state === "saving" || completed
            }
            onClick={save}
          >
            {saveButtonLabel({ state, isLoading, isAuthenticated })}
          </button>
        </Show>
      </ClerkLoaded>

      <p
        className={`min-h-5 text-sm ${state === "error" ? "text-[var(--error)]" : "text-[var(--muted)]"}`}
        aria-live="polite"
      >
        {saveStatus(state)}
      </p>
    </div>
  );
}

function saveButtonLabel({
  state,
  isLoading,
  isAuthenticated,
}: {
  state: SaveState;
  isLoading: boolean;
  isAuthenticated: boolean;
}) {
  if (isLoading || !isAuthenticated) return "Connecting…";
  if (state === "saving") return "Saving…";
  if (state === "saved" || state === "existing") return "Saved";
  if (state === "error") return "Try saving again";
  return "Save recipe";
}

function saveStatus(state: SaveState) {
  if (state === "saved") return "Saved to your recipes.";
  if (state === "existing") return "This recipe was already saved.";
  if (state === "error") return "The recipe was not saved. Please try again.";
  return "";
}
