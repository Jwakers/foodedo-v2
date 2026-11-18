// @vitest-environment node
import { afterEach, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RelatedRecipesCarousel } from "@/features/recipes/related-recipes-carousel";
import type { CatalogueMealSummary } from "@/lib/domain/recipes";

vi.mock("@/features/allergies/recipe-allergy-badge", () => ({
  RecipeAllergyBadge: () => null,
}));

const recipes: CatalogueMealSummary[] = [
  {
    id: "tacos",
    slug: "tacos",
    title: "Beef tacos",
    proteinCategory: "beef",
    version: 1,
    position: 0,
    servings: 2,
    prepMinutes: 10,
    cookMinutes: 15,
  },
];
afterEach(() => vi.unstubAllEnvs());

test("web recipes link to the planning guide and show servings and total time", () => {
  vi.stubEnv("NEXT_PUBLIC_CAPACITOR_BUILD", "false");
  const html = renderToStaticMarkup(
    <RelatedRecipesCarousel recipes={recipes} />,
  );
  expect(html).toContain('href="/recipe-to-shopping-list"');
  expect(html).toContain('href="/recipes/tacos"');
  expect(html).toContain("Serves 2 · 25 min");
});

test("native recipes retain static recipe links and omit the web-only guide", () => {
  vi.stubEnv("NEXT_PUBLIC_CAPACITOR_BUILD", "true");
  const html = renderToStaticMarkup(
    <RelatedRecipesCarousel recipes={recipes} />,
  );
  expect(html).not.toContain("/recipe-to-shopping-list");
  expect(html).toContain('href="/recipes/view?slug=tacos"');
});
