// @vitest-environment node
import { expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  exampleItems,
  exampleRecipes,
  ShoppingListExample,
} from "../../src/features/public-pages/shopping-list-example";
import { classifyShoppingIngredient } from "../../src/lib/domain/shopping-list";
import { assertExampleSource } from "../../scripts/audit-shopping-list-example.mjs";
import reviewedArticles from "../../src/features/blog/reviewed-articles.json";
import { localGuides } from "../../src/features/blog/guides";
import { ArticleBody } from "../../src/features/blog/article-body";
import type { BlogArticle } from "../../src/features/blog/content";

test("the reviewed dinners serve two and account for every non-water ingredient", () => {
  expect(exampleRecipes).toHaveLength(3);
  expect(exampleRecipes.every((recipe) => recipe.servings === 2)).toBe(true);
  const expected = exampleRecipes
    .flatMap((recipe) => recipe.ingredients)
    .filter((line) => classifyShoppingIngredient(line.name) !== "omit");
  expect(exampleItems.flatMap((item) => item.sources)).toHaveLength(
    expected.length,
  );
  expect(exampleItems.some((item) => /water/i.test(item.name))).toBe(false);
  expect(
    exampleItems
      .filter((item) => item.treatment === "staple")
      .map((item) => item.name),
  ).toContain("olive oil");
});

test("the published example combines compatible quantities without inventing conversions", () => {
  const item = (name: string) =>
    exampleItems.find((item) => item.name === name)!;
  expect(item("broccoli").displayName).toBe("550 g broccoli");
  expect(item("fresh ginger").displayName).toBe("30 g fresh ginger");
  expect(item("cornflour").displayName).toBe("5 tsp cornflour");
  expect(item("rice vinegar").displayName).toBe("rice vinegar");
  expect(item("rice vinegar").sources.map((source) => source.amount)).toEqual([
    "1 tbsp",
    "15 ml",
  ]);
  expect(item("long-grain white rice").displayName).toBe(
    "180 g long-grain white rice",
  );
  expect(item("jasmine rice").displayName).toBe("150 g jasmine rice");
  expect(item("garlic").displayName).toBe("7 garlic cloves");
  expect(item("salmon fillets").displayName).toBe("2 salmon fillets");
  expect(item("tomato").displayName).toBe("2 tomatoes");
  for (const name of ["fine salt", "black pepper"]) {
    const staples = exampleItems.filter((item) => item.name === name);
    expect(staples).toHaveLength(1);
    expect(staples[0].sources).toHaveLength(name === "fine salt" ? 3 : 2);
  }
});

test("the source audit rejects missing, revised and changed ingredient data", () => {
  const recipe = exampleRecipes[0];
  expect(() =>
    assertExampleSource(recipe, structuredClone(recipe)),
  ).not.toThrow();
  expect(() => assertExampleSource(recipe, null)).toThrow(/missing/);
  expect(() =>
    assertExampleSource(recipe, { ...recipe, version: recipe.version + 1 }),
  ).toThrow(/version changed/);
  expect(() =>
    assertExampleSource(recipe, { ...recipe, ingredients: [] }),
  ).toThrow(/ingredients changed/);
});

test("the example provides recipe links and all source details in its HTML", () => {
  const html = renderToStaticMarkup(<ShoppingListExample />);
  for (const recipe of exampleRecipes)
    expect(html).toContain(`href="/recipes/${recipe.slug}"`);
  expect(html).toContain("550 g broccoli");
  expect(html).toContain("Check your cupboards");
  expect(html).toContain("1 tbsp · Tofu Stir-Fry");
  expect(html).toContain("15 ml · Teriyaki Salmon");
});

test("weeknight and meal-planning articles render links to the reviewed public recipes", () => {
  const articles = [
    ...reviewedArticles.filter(
      (article) =>
        article.slug === "quick-weeknight-dinners-busy-families" ||
        article.slug.includes("meal-plan"),
    ),
    ...localGuides.filter(
      (article) =>
        article.slug.includes("meal-plan") ||
        article.slug.includes("meals-varied"),
    ),
  ];
  const destinations = new Set(
    exampleRecipes.map((recipe) => `/recipes/${recipe.slug}`),
  );
  for (const article of articles) {
    const html = renderToStaticMarkup(
      <ArticleBody body={article.body as BlogArticle["body"]} />,
    );
    const links = [...html.matchAll(/href="(\/recipes\/[^"?]+)"/g)];
    expect(links.length, article.slug).toBeGreaterThan(0);
    for (const [, href] of links) expect(destinations.has(href)).toBe(true);
  }
});
