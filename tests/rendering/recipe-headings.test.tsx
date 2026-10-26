// @vitest-environment node
import { expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
import { RecipeCard } from "../../src/features/recipes/recipe-card";
import { RecipeDetailContent } from "../../src/features/recipes/recipe-detail-content";
import { CookHeader } from "../../src/features/cook/cook-mode-screens";
import type { CatalogueMeal } from "../../src/lib/domain/recipes";

const meal: CatalogueMeal = {
  id: "raw_recipe_id",
  version: 1,
  slug: "raw-recipe",
  position: 0,
  title: "pasta_and_sauce",
  proteinCategory: "meat-free",
  servings: 2,
  ingredients: [
    {
      id: "pasta_id",
      name: "Pasta",
      shoppingCategory: "pantry",
      quantity: "200",
      unit: "g",
      group: "pasta_and_sauce",
      noteRefs: ["cooking_note"],
    },
  ],
  steps: [
    {
      id: "step_id",
      text: "Keep the authored_text unchanged.",
      group: "cook_the_pasta",
      noteRefs: ["cooking_note"],
    },
  ],
  notes: [
    { id: "cooking_note", label: "before_you_start", text: "Use a large pan." },
  ],
};

test("existing stored headings display cleanly on cards, detail and Cook without changing recipe data", () => {
  const before = JSON.stringify(meal);
  const card = renderToStaticMarkup(
    <RecipeCard
      title={meal.title}
      meta={null}
      saved={false}
      onToggleSave={() => {}}
    />,
  );
  const detail = renderToStaticMarkup(
    <RecipeDetailContent meal={meal} presentation="page" />,
  );
  const cook = renderToStaticMarkup(
    <CookHeader title={meal.title} onExit={() => {}} />,
  );
  expect(card).toContain("Pasta and sauce");
  expect(card).toContain('aria-label="Save Pasta and sauce"');
  expect(detail).toContain("Pasta and sauce");
  expect(detail).toContain("Cook the pasta");
  expect(detail).toContain("Before you start");
  expect(detail).toContain("Keep the authored_text unchanged.");
  expect(cook).toContain("Pasta and sauce");
  expect(JSON.stringify(meal)).toBe(before);
});
