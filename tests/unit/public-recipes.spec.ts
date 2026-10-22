import { expect, test } from "@playwright/test";
import type { CatalogueMeal } from "../../src/lib/domain/recipes";
import {
  recipeMetadata,
  recipeStructuredData,
} from "../../src/features/public-recipes/metadata";
import { jsonLd } from "../../src/features/blog/metadata";

const recipe: CatalogueMeal = {
  id: "meal-one",
  version: 3,
  slug: "one-pot-dinner",
  position: 1,
  title: "One-pot dinner",
  description: "A quick dinner.",
  proteinCategory: "meat-free",
  servings: 2,
  prepMinutes: 10,
  cookMinutes: 20,
  ingredients: [
    {
      id: "beans",
      name: "beans",
      quantity: "400",
      unit: "g",
      note: "drained",
      shoppingCategory: "pantry",
    },
  ],
  steps: [{ id: "cook", text: "Cook the beans." }],
};

test("recipe metadata and structured data use authored facts and the public canonical", () => {
  expect(recipeMetadata(recipe).alternates?.canonical).toBe(
    "https://www.foodedo.com/recipes/one-pot-dinner",
  );
  expect(recipeMetadata(recipe).title).toBe("One-pot dinner | Foodedo");
  const data = JSON.parse(jsonLd(recipeStructuredData(recipe)));
  expect(data).toMatchObject({
    "@type": "Recipe",
    name: recipe.title,
    recipeYield: "2",
    prepTime: "PT10M",
    cookTime: "PT20M",
    totalTime: "PT30M",
    recipeIngredient: ["400 g beans (drained)"],
    recipeInstructions: [{ "@type": "HowToStep", text: "Cook the beans." }],
  });
  for (const missing of [
    "datePublished",
    "dateModified",
    "author",
    "aggregateRating",
    "nutrition",
  ])
    expect(data).not.toHaveProperty(missing);
});

test("optional timings, servings and images are omitted rather than fabricated", () => {
  const data = JSON.parse(
    jsonLd(
      recipeStructuredData({
        ...recipe,
        servings: undefined,
        prepMinutes: undefined,
        imageSrc: undefined,
      }),
    ),
  );
  for (const missing of ["recipeYield", "prepTime", "totalTime", "image"])
    expect(data).not.toHaveProperty(missing);
  expect(data).not.toHaveProperty("cookTime");
  expect(
    jsonLd(
      recipeStructuredData({
        ...recipe,
        title: "</script><script>unsafe</script>",
      }),
    ),
  ).not.toContain("</script>");
});

test("hydrated schema preserves the server canonical and resolves image URLs", () => {
  const canonical = "https://preview.example/recipes/one-pot-dinner";
  expect(
    recipeStructuredData({ ...recipe, imageSrc: "/photo.jpg" }, canonical),
  ).toMatchObject({
    url: canonical,
    image: "https://preview.example/photo.jpg",
  });
});
