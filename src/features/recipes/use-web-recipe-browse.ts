"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import {
  emptyRecipeFilters,
  type RecipeFilters,
} from "@/lib/domain/recipe-filtering";
import { recipeDirectoryPath } from "@/lib/domain/recipe-directory";
import {
  parseRecipeBrowse,
  recipeBrowseHref,
  type WebRecipeBrowse,
} from "@/lib/domain/recipe-browse";

const locationEvent = "foodedo:recipe-browse";

/** Opening Saved also works when the listing is already mounted with filters. */
export function openSavedRecipes(navigate: (href: string) => void) {
  const href = "/recipes?scope=Saved";
  if (window.location.pathname === "/recipes") {
    window.history.pushState(null, "", href);
    window.dispatchEvent(new Event(locationEvent));
    window.scrollTo({ top: 0 });
  } else {
    navigate(href);
  }
}

/** Native retains local state. Web refinements use history without a server round trip per keystroke. */
export function useWebRecipeBrowse(
  enabled: boolean,
  initialPage: number,
  initialLocation?: string,
) {
  const serverLocation = initialLocation ?? recipeDirectoryPath(initialPage);
  const subscribe = useCallback(
    (notify: () => void) => {
      if (!enabled) return () => {};
      window.addEventListener("popstate", notify);
      window.addEventListener(locationEvent, notify);
      return () => {
        window.removeEventListener("popstate", notify);
        window.removeEventListener(locationEvent, notify);
      };
    },
    [enabled],
  );
  const location = useSyncExternalStore(
    subscribe,
    () =>
      enabled
        ? `${window.location.pathname}${window.location.search}`
        : serverLocation,
    () => serverLocation,
  );
  const state = useMemo(
    () =>
      enabled
        ? parseRecipeBrowse(location)
        : {
            page: 1,
            scope: "All" as const,
            search: "",
            filters: emptyRecipeFilters,
            sort: "recommended" as const,
          },
    [enabled, location],
  );
  // Changing page or sort must not reset unsubmitted edits in the filter drawer.
  const serializedFilters = JSON.stringify(state.filters);
  const filters = useMemo<RecipeFilters>(
    () => JSON.parse(serializedFilters),
    [serializedFilters],
  );
  function update(next: WebRecipeBrowse, push = false) {
    const href = recipeBrowseHref(next);
    if (push) window.history.pushState(null, "", href);
    else window.history.replaceState(null, "", href);
    window.dispatchEvent(new Event(locationEvent));
  }
  return { state: { ...state, filters }, update };
}
