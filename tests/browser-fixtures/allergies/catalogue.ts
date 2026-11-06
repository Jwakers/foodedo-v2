import { recipeAllergyEvidence } from "../../../src/lib/domain/allergies";
const recipes = [
  { id: "milk-meal", title: "Creamy potatoes", name: "cream" },
  { id: "pesto-meal", title: "Pesto rice", name: "pesto" },
  { id: "rice-meal", title: "Plain rice", name: "rice" },
];
export const catalogue = {
  meals: recipes.map((recipe, position) => ({
    id: recipe.id,
    version: 1,
    slug: recipe.id,
    position,
    title: recipe.title,
    proteinCategory: "meat-free",
    ...recipeAllergyEvidence({ ingredients: [{ name: recipe.name }] }),
  })),
};
