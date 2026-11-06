// @vitest-environment node
import { expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StepIngredientContent } from "../../src/features/cook/step-ingredient-content";
import {
  prepareRecipeContent,
  type RecipeContent,
} from "../../src/lib/domain/recipes";
import { recipeServingModel } from "../../src/lib/domain/ingredient-scaling";

const recipe: RecipeContent = {
  title: "Coriander onions",
  proteinCategory: "meat-free",
  servings: 2,
  ingredients: [
    {
      id: "onion",
      name: "onions",
      quantity: "1",
      note: "finely chopped",
      shoppingCategory: "fruit_and_veg",
    },
    {
      id: "spice",
      name: "ground coriander",
      quantity: "½",
      unit: "tsp",
      shoppingCategory: "pantry",
    },
  ],
  steps: [
    { id: "add", text: "Add onion and ground coriander. Stir the onion." },
  ],
};
function render(input: RecipeContent, servings = 4) {
  const prepared = prepareRecipeContent(input);
  return renderToStaticMarkup(
    <StepIngredientContent
      step={prepared.steps[0]!}
      ingredients={recipeServingModel(prepared, servings).ingredients}
    />,
  );
}

test("legacy steps without mappings retain readable instructions without warnings", () => {
  const html = renderToStaticMarkup(
    <StepIngredientContent
      step={recipe.steps[0]!}
      ingredients={recipeServingModel(recipe, 4).ingredients}
    />,
  );
  expect(html.replace(/<[^>]+>/g, "")).toBe(recipe.steps[0]!.text);
  expect(html).not.toContain("<mark");
  expect(html).not.toContain("<li");
});

test("highlights literal phrases, deduplicates rows, and shows shared scaled amounts and prep notes", () => {
  const html = render(recipe);
  expect(html.match(/<mark /g)).toHaveLength(3);
  expect(html.match(/<li /g)).toHaveLength(2);
  expect(html).toContain("2 onions");
  expect(html).toContain("1 tsp ground coriander");
  expect(html).toContain("finely chopped");
  expect(html).toContain("You’ll need");
  expect(html.replace(/<[^>]+>/g, "")).toContain(
    "Add onion and ground coriander. Stir the onion.",
  );
});

test("source-only ingredients keep authored amounts", () => {
  const html = render({ ...recipe, servingScaling: "source_only" });
  expect(html).toContain("1 onions");
  expect(html).toContain("½ tsp ground coriander");
});

test("genuinely ambiguous spices remain visible with a specific reference label", () => {
  const html = render({
    ...recipe,
    ingredients: [
      recipe.ingredients[1]!,
      {
        id: "herb",
        name: "fresh coriander",
        quantity: "1",
        unit: "bunch",
        group: "Garnish",
        note: "roughly chopped",
        shoppingCategory: "fruit_and_veg",
      },
    ],
    steps: [{ id: "add", text: "Add coriander." }],
  });
  expect(html).not.toContain("<mark");
  expect(html).not.toContain("You’ll need");
  expect(html).toContain("Ingredient reference");
  expect(html).not.toContain("<details");
  expect(html).toContain("recipe totals");
  expect(html).toContain("Garnish");
  expect(html).toContain("roughly chopped");
});

test("generic partial coverage does not produce a warning accordion for prepared mixtures", () => {
  const html = render({
    ...recipe,
    steps: [{ id: "sauce", text: "Stir in the sauce made earlier." }],
  });
  expect(html).not.toContain("Check ingredient amounts");
  expect(html).not.toContain("<details");
  expect(html).not.toContain("Ingredient reference");
});

test("remaining amounts and explicit portions label totals without inventing arithmetic", () => {
  for (const text of [
    "Add remaining onion.",
    "Add half the onion.",
    "Add 1 onion.",
  ]) {
    const html = render({ ...recipe, steps: [{ id: "add", text }] });
    expect(html.toLowerCase()).toContain("recipe total");
    expect(html).toContain(text === "Add 1 onion." ? "1 onions" : "2 onions");
  }
});

test("plain and ingredient-free steps remain readable without empty lists", () => {
  const html = render({
    ...recipe,
    steps: [{ id: "rest", text: "Rest for 10 minutes." }],
  });
  expect(html).toContain("Rest for 10 minutes.");
  expect(html).not.toContain("<mark");
  expect(html).not.toContain("You’ll need");
});

test("bad character ranges cannot corrupt the original instruction", () => {
  const prepared = prepareRecipeContent(recipe);
  prepared.steps[0]!.ingredientMapping!.references[0]!.end = 10000;
  const html = renderToStaticMarkup(
    <StepIngredientContent
      step={prepared.steps[0]!}
      ingredients={prepared.ingredients}
    />,
  );
  expect(html).toContain("Add onion and ground coriander. Stir the onion.");
});

test("an optional explicit amount stays visibly optional with one total footnote", () => {
  const html = render({
    ...recipe,
    steps: [{ id: "optional", text: "Add 1 onion if desired." }],
  });
  expect(html).toContain("Optional");
  expect(html.match(/Quantities shown are recipe totals\./g)).toHaveLength(1);
  expect(html).not.toContain("follow the instruction for the amount");
});

test("references to missing IDs or partial words fall back to original prose", () => {
  for (const corrupt of ["id", "word"] as const) {
    const input = prepareRecipeContent(recipe);
    const reference = input.steps[0]!.ingredientMapping!.references[0]!;
    if (corrupt === "id") reference.ingredientIds = ["not-an-ingredient"];
    else reference.start++;
    const html = renderToStaticMarkup(
      <StepIngredientContent
        step={input.steps[0]!}
        ingredients={input.ingredients}
      />,
    );
    expect(html).not.toContain("<mark");
    expect(html).not.toContain("You’ll need");
    expect(html).toContain(input.steps[0]!.text);
  }
});
