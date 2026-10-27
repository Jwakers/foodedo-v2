import {
  recipeSortOptions,
  type RecipeFilters,
  type RecipeSort,
} from "./recipe-filtering";
import { PROTEIN_CATEGORIES } from "./recipes";
import { recipeDirectoryPath } from "./recipe-directory";

export type RecipeScope = "All" | "Saved" | "Yours";
export type WebRecipeBrowse = {
  page: number;
  scope: RecipeScope;
  search: string;
  filters: RecipeFilters;
  sort: RecipeSort;
};

export function parseRecipeBrowse(location: string): WebRecipeBrowse {
  const url = new URL(location, "https://foodedo.example");
  const value = url.searchParams.get("page") ?? "1";
  const page =
    /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value))
      ? Number(value)
      : 1;
  const scope = url.searchParams.get("scope");
  const sort = url.searchParams.get("sort");
  return {
    page,
    scope: scope === "Saved" || scope === "Yours" ? scope : "All",
    search: url.searchParams.get("q") ?? "",
    filters: {
      under30Minutes: url.searchParams.get("quick") === "1",
      budgetFriendly: url.searchParams.get("budget") === "1",
      proteinCategories: PROTEIN_CATEGORIES.filter((category) =>
        url.searchParams.getAll("protein").includes(category),
      ),
    },
    sort: recipeSortOptions.find((option) => option === sort) ?? "recommended",
  };
}

export function isPublicRecipeBrowse(state: WebRecipeBrowse) {
  return (
    state.scope === "All" &&
    !state.search &&
    state.sort === "recommended" &&
    !state.filters.under30Minutes &&
    !state.filters.budgetFriendly &&
    state.filters.proteinCategories.length === 0
  );
}

export function recipeBrowseHref(state: WebRecipeBrowse) {
  if (isPublicRecipeBrowse(state)) return recipeDirectoryPath(state.page);
  const params = new URLSearchParams();
  if (state.scope !== "All") params.set("scope", state.scope);
  if (state.search) params.set("q", state.search);
  if (state.sort !== "recommended") params.set("sort", state.sort);
  if (state.filters.under30Minutes) params.set("quick", "1");
  if (state.filters.budgetFriendly) params.set("budget", "1");
  for (const category of state.filters.proteinCategories)
    params.append("protein", category);
  if (state.page > 1) params.set("page", String(state.page));
  return params.size ? `/recipes?${params}` : "/recipes";
}
