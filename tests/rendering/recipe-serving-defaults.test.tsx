// @vitest-environment node
import { beforeEach, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { CatalogueMeal } from "@/lib/domain/recipes";

const state = vi.hoisted(() => ({
  search: new URLSearchParams(),
  query: vi.fn(() => ({ usualServings: 2 })),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => state.search,
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("convex/react", () => ({
  useMutation: () => vi.fn(),
  useQuery: state.query,
}));
vi.mock("@/features/auth/use-foodedo-auth", () => ({
  useFoodedoAuth: () => ({ status: "signedIn", isAuthenticated: true }),
}));
vi.mock("@/features/recipes/use-catalogue", () => ({
  useCurrentCatalogueMeal: () => meal,
  useCatalogueMeal: () => meal,
}));
vi.mock("@/features/recipes/use-personal-recipe", () => ({
  usePersonalRecipe: () => undefined,
}));
vi.mock("@/features/plan/plan-this-meal", () => ({
  PlanThisMeal: () => null,
}));
vi.mock("@/features/cook/cook-mode-page", () => ({
  CookModePage: ({ servings }: { servings: number }) => (
    <p>Cooking {servings}</p>
  ),
}));

import { RecipeDetailPage } from "@/features/recipes/recipe-detail-page";
import { PublicRecipeDetail } from "@/features/recipes/public-recipe-detail";
import { CookModeRoute } from "@/features/cook/cook-mode-route";
import { recipeDetailPath } from "@/lib/routing/recipes";

const meal: CatalogueMeal = {
  id: "test-meal",
  version: 1,
  slug: "pasta",
  position: 0,
  title: "Pasta",
  proteinCategory: "meat-free",
  servings: 6,
  ingredients: [
    {
      id: "pasta",
      name: "Pasta",
      quantity: "600",
      unit: "g",
      shoppingCategory: "pantry",
    },
  ],
  steps: [{ id: "cook", text: "Cook the pasta." }],
};

beforeEach(() => {
  state.search = new URLSearchParams({ slug: meal.slug });
  state.query.mockClear();
});

test("signed-in browsing uses the recipe's own servings on web and native detail routes", () => {
  const publicDetail = renderToStaticMarkup(
    <PublicRecipeDetail
      initialRecipe={meal}
      canonicalUrl="https://foodedo.com/recipes/pasta"
    />,
  );
  const staticDetail = renderToStaticMarkup(<RecipeDetailPage />);
  for (const html of [publicDetail, staticDetail]) {
    expect(html).toContain("Serves 6");
    expect(html).toContain("600 g");
  }
  expect(state.query).not.toHaveBeenCalled();
});

test("a meal-plan link retains its servings and scaled ingredients", () => {
  const href = recipeDetailPath(
    meal.slug,
    { catalogueMealId: meal.id, catalogueVersion: meal.version },
    2,
  );
  state.search = new URL(href, "https://foodedo.com").searchParams;
  const html = renderToStaticMarkup(<RecipeDetailPage />);
  expect(html).toContain("Serves 2");
  expect(html).toContain("200 g");
});

test("Cook uses recipe defaults for direct visits and explicit servings from a plan or recipe", () => {
  expect(renderToStaticMarkup(<CookModeRoute />)).toContain("Cooking 6");
  state.search.set("servings", "2");
  expect(renderToStaticMarkup(<CookModeRoute />)).toContain("Cooking 2");
  expect(state.query).not.toHaveBeenCalled();
});
