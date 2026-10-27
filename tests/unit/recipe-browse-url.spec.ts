import { expect, test } from "@playwright/test";
import {
  parseRecipeBrowse,
  recipeBrowseHref,
} from "../../src/lib/domain/recipe-browse";

test("public pages and refinements round-trip through query parameters", () => {
  expect(recipeBrowseHref(parseRecipeBrowse("/recipes?page=3"))).toBe(
    "/recipes?page=3",
  );
  const location =
    "/recipes?q=chicken&scope=Saved&sort=quickest&protein=chicken&protein=turkey&quick=1&budget=1&page=2";
  const state = parseRecipeBrowse(location);
  expect(state).toMatchObject({
    page: 2,
    search: "chicken",
    scope: "Saved",
    sort: "quickest",
    filters: {
      under30Minutes: true,
      budgetFriendly: true,
      proteinCategories: ["chicken", "turkey"],
    },
  });
  expect(parseRecipeBrowse(recipeBrowseHref(state))).toEqual(state);
});

test("untrusted query values cannot create invalid scopes, sort orders or page numbers", () => {
  const state = parseRecipeBrowse(
    "/recipes?scope=private&sort=unknown&protein=invalid&page=9999999999999999999",
  );
  expect(state).toMatchObject({
    scope: "All",
    sort: "recommended",
    page: 1,
    filters: { proteinCategories: [] },
  });
  for (const value of ["0", "-1", "1.5", "nope"])
    expect(parseRecipeBrowse(`/recipes?page=${value}`).page).toBe(1);
});
