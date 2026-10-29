"use client";

import { useClerk } from "@clerk/react";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";

import { api } from "../../../convex/_generated/api";
import {
  createCatalogueSaveIntent,
  readCatalogueSaveIntent,
} from "@/lib/domain/auth-intents";
import { createCatalogueSaveIntentStore } from "@/lib/platform/auth-intent-store";
import { optimisticallySetCatalogueSaved } from "./optimistic-catalogue-saves";
import { useFoodedoAuth } from "@/features/auth/use-foodedo-auth";
import { useRecipeSaveConfirmation } from "./recipe-save-confirmation";

type ToggleCatalogueSaveArgs = {
  catalogueMealId: string;
  catalogueVersion: number;
  title: string;
};

const emptySavedMealIds: ReadonlySet<string> = new Set();

/**
 * Reactive catalogue-library state and the single save entry point for recipe
 * surfaces. Guests persist one intent before Clerk opens.
 */
export function useCatalogueRecipeLibrary() {
  const { status, isClerkLoaded, isSignedIn, isAuthenticated, userId } =
    useFoodedoAuth();
  const confirmation = useRecipeSaveConfirmation();
  const { openSignIn } = useClerk();
  const savedRecipes = useQuery(
    api.recipes.listSavedCatalogueMeals,
    isAuthenticated ? {} : "skip",
  );
  const setSavedMutation = useMutation(api.recipes.setCatalogueMealSaved);
  const setSaved = useMemo(
    () =>
      setSavedMutation.withOptimisticUpdate(optimisticallySetCatalogueSaved),
    [setSavedMutation],
  );
  const savedMealIds = useMemo(
    () =>
      savedRecipes
        ? new Set(savedRecipes.map((recipe) => recipe.catalogueMealId))
        : emptySavedMealIds,
    [savedRecipes],
  );

  async function toggleSave({
    catalogueMealId,
    catalogueVersion,
    title,
  }: ToggleCatalogueSaveArgs) {
    if (!isClerkLoaded) {
      toast.info("Foodedo is still checking your account. Try again.");
      return;
    }

    if (!isSignedIn) {
      try {
        await createCatalogueSaveIntentStore().write(
          createCurrentCatalogueSaveIntent(catalogueMealId, catalogueVersion),
        );
      } catch (error) {
        console.error("Failed to store catalogue-save resume intent.", error);
        toast.error(
          "Foodedo couldn’t save your place. Check storage access and try again.",
        );
        return;
      }

      openSignIn({});
      return;
    }

    if (status !== "authenticated" || !userId) {
      toast.error(
        "Foodedo couldn’t connect your account yet. Try saving again.",
      );
      return;
    }

    // Wait for saved state so we pick remove vs save correctly.
    if (savedRecipes === undefined) {
      return;
    }

    const saved = !savedMealIds.has(catalogueMealId);
    const complete = confirmation.begin(userId, catalogueMealId, saved);
    try {
      const result = await setSaved({
        catalogueMealId,
        catalogueVersion,
        saved,
        supportsSaveConfirmation: true,
      });
      complete(result?.showSavedConfirmation === true);
    } catch (error) {
      console.error(`Failed to update saved recipe “${title}”.`, error);
      toast.error("Foodedo couldn’t update this saved recipe. Try again.");
    }
  }

  const isLibraryLoading = Boolean(
    isClerkLoaded &&
    isSignedIn &&
    (status === "loading" ||
      status === "connection_error" ||
      savedRecipes === undefined),
  );

  return {
    isLibraryLoading,
    isSaved: (catalogueMealId: string) => savedMealIds.has(catalogueMealId),
    isSaveDisabled: isLibraryLoading,
    savedMealIds,
    toggleSave,
  };
}

/**
 * Resumes a guest catalogue save after modal or redirect authentication.
 * Mounted once at app-shell level so returning on any route completes the job.
 */
export function CatalogueSaveIntentResume() {
  const { status, isAuthenticated, userId } = useFoodedoAuth();
  const confirmation = useRecipeSaveConfirmation();
  const setSavedMutation = useMutation(api.recipes.setCatalogueMealSaved);
  const setSaved = useMemo(
    () =>
      setSavedMutation.withOptimisticUpdate(optimisticallySetCatalogueSaved),
    [setSavedMutation],
  );
  const isResumingRef = useRef(false);

  useEffect(() => {
    if (
      status === "loading" ||
      !isAuthenticated ||
      !userId ||
      isResumingRef.current
    ) {
      return;
    }

    isResumingRef.current = true;

    void (async () => {
      const store = createCatalogueSaveIntentStore();

      try {
        const intent = readCatalogueSaveIntent(await store.read());
        if (!intent) return;

        const complete = confirmation.begin(
          userId,
          intent.catalogueMealId,
          true,
        );
        const result = await setSaved({
          catalogueMealId: intent.catalogueMealId,
          catalogueVersion: intent.catalogueVersion,
          saved: true,
          supportsSaveConfirmation: true,
        });
        complete(result?.showSavedConfirmation === true);

        await store.clear();
      } catch (error) {
        console.error("Failed to resume catalogue recipe save.", error);
        toast.error(
          "Foodedo couldn’t finish saving that recipe. Try saving it again.",
        );
      } finally {
        isResumingRef.current = false;
      }
    })();
  }, [isAuthenticated, setSaved, status, userId, confirmation]);

  return null;
}

function createCurrentCatalogueSaveIntent(
  catalogueMealId: string,
  catalogueVersion: number,
) {
  return createCatalogueSaveIntent({
    catalogueVersion,
    catalogueMealId,
    now: Date.now(),
  });
}
