"use client";

import { useAuth, useClerk } from "@clerk/react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useRef, useState } from "react";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  createCatalogueSaveIntent,
  readCatalogueSaveIntent,
} from "@/lib/domain/auth-intents";
import { standardCatalogue } from "@/lib/domain/standard-catalogue";
import { createCatalogueSaveIntentStore } from "@/lib/platform/auth-intent-store";
import { temporaryFeedback } from "@/lib/ui/temporary-feedback";

type ToggleCatalogueSaveArgs = {
  catalogueMealId: string;
  title: string;
};

const emptySavedRecipeMap: ReadonlyMap<string, Id<"recipes">> = new Map();

/**
 * Reactive catalogue-library state and the single save entry point for recipe
 * surfaces. Guests persist one intent before Clerk opens.
 */
export function useCatalogueRecipeLibrary() {
  const { isLoaded, isSignedIn } = useAuth();
  const { openSignIn } = useClerk();
  const { isAuthenticated, isLoading: isConvexAuthLoading } = useConvexAuth();
  const savedRecipes = useQuery(
    api.recipes.listSavedCatalogueMeals,
    isAuthenticated ? { catalogueVersion: standardCatalogue.version } : "skip",
  );
  const saveCatalogueMeal = useMutation(api.recipes.saveCatalogueMeal);
  const removeMineFromLibrary = useMutation(api.recipes.removeMineFromLibrary);
  const pendingMealIdsRef = useRef(new Set<string>());
  const [pendingMealIds, setPendingMealIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const savedRecipeIdByMealId = useMemo(() => {
    if (!savedRecipes) return emptySavedRecipeMap;

    return new Map(
      savedRecipes.map(({ catalogueMealId, recipeId }) => [
        catalogueMealId,
        recipeId,
      ]),
    );
  }, [savedRecipes]);

  async function toggleSave({
    catalogueMealId,
    title,
  }: ToggleCatalogueSaveArgs) {
    if (pendingMealIdsRef.current.has(catalogueMealId)) return;

    if (!isLoaded) {
      temporaryFeedback("Foodedo is still checking your account. Try again.");
      return;
    }

    if (!isSignedIn) {
      try {
        await createCatalogueSaveIntentStore().write(
          createCurrentCatalogueSaveIntent(catalogueMealId),
        );
      } catch (error) {
        console.error("Failed to store catalogue-save resume intent.", error);
        temporaryFeedback(
          "Foodedo couldn’t save your place. Check storage access and try again.",
        );
        return;
      }

      openSignIn({});
      return;
    }

    if (isConvexAuthLoading || !isAuthenticated) {
      temporaryFeedback(
        "Foodedo couldn’t connect your account yet. Try saving again.",
      );
      return;
    }

    // Wait for saved state so we pick remove vs save correctly.
    if (savedRecipes === undefined) {
      return;
    }

    setMealPending(catalogueMealId, true);
    try {
      const savedRecipeId = savedRecipeIdByMealId.get(catalogueMealId);
      if (savedRecipeId) {
        const result = await removeMineFromLibrary({
          recipeId: savedRecipeId,
        });
        if (result.status === "not_found") {
          temporaryFeedback(`“${title}” is no longer in your saved recipes.`);
        }
        return;
      }

      const result = await saveCatalogueMeal({
        catalogueMealId,
        catalogueVersion: standardCatalogue.version,
      });
      if (result.status === "catalogue_unsupported") {
        temporaryFeedback("This recipe can’t be saved right now.");
      }
    } catch (error) {
      console.error(`Failed to update saved recipe “${title}”.`, error);
      temporaryFeedback(
        "Foodedo couldn’t update this saved recipe. Try again.",
      );
    } finally {
      setMealPending(catalogueMealId, false);
    }
  }

  function setMealPending(catalogueMealId: string, pending: boolean) {
    if (pending) {
      pendingMealIdsRef.current.add(catalogueMealId);
    } else {
      pendingMealIdsRef.current.delete(catalogueMealId);
    }
    setPendingMealIds(new Set(pendingMealIdsRef.current));
  }

  const isLibraryLoading = Boolean(
    isLoaded &&
      isSignedIn &&
      (isConvexAuthLoading || !isAuthenticated || savedRecipes === undefined),
  );

  return {
    isLibraryLoading,
    isSaved: (catalogueMealId: string) =>
      savedRecipeIdByMealId.has(catalogueMealId),
    isSavePending: (catalogueMealId: string) =>
      isLibraryLoading || pendingMealIds.has(catalogueMealId),
    savedRecipeIdByMealId,
    toggleSave,
  };
}

/**
 * Resumes a guest catalogue save after modal or redirect authentication.
 * Mounted once at app-shell level so returning on any route completes the job.
 */
export function CatalogueSaveIntentResume() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const saveCatalogueMeal = useMutation(api.recipes.saveCatalogueMeal);
  const isResumingRef = useRef(false);

  useEffect(() => {
    if (isLoading || !isAuthenticated || isResumingRef.current) return;

    isResumingRef.current = true;

    void (async () => {
      const store = createCatalogueSaveIntentStore();

      try {
        const intent = readCatalogueSaveIntent(await store.read());
        if (!intent) return;

        const result = await saveCatalogueMeal({
          catalogueMealId: intent.catalogueMealId,
          catalogueVersion: intent.catalogueVersion,
        });

        if (result.status === "catalogue_unsupported") {
          temporaryFeedback("This recipe can’t be saved right now.");
        }
        await store.clear();
      } catch (error) {
        console.error("Failed to resume catalogue recipe save.", error);
        temporaryFeedback(
          "Foodedo couldn’t finish saving that recipe. Try saving it again.",
        );
      } finally {
        isResumingRef.current = false;
      }
    })();
  }, [isAuthenticated, isLoading, saveCatalogueMeal]);

  return null;
}

function createCurrentCatalogueSaveIntent(catalogueMealId: string) {
  return createCatalogueSaveIntent({
    catalogueVersion: standardCatalogue.version,
    catalogueMealId,
    now: Date.now(),
  });
}
