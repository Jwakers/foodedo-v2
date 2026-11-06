import { useState } from "react";
import { createRoot } from "react-dom/client";
import { CookModePage } from "../../../src/features/cook/cook-mode-page";
import {
  prepareRecipeContent,
  type CatalogueMeal,
  type RecipeContent,
} from "../../../src/lib/domain/recipes";

// Simulate the backend response. Production Cook never runs this preparation.
const input: RecipeContent = {
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
      id: "ground",
      name: "ground coriander",
      quantity: "½",
      unit: "tsp",
      shoppingCategory: "pantry",
    },
    {
      id: "oil",
      name: "olive oil",
      quantity: "2",
      unit: "tbsp",
      shoppingCategory: "pantry",
    },
  ],
  steps: [
    {
      id: "fry",
      text: "Add onion and ground coriander. Fry for 30 seconds.",
      timerCues: [
        { id: "fry-timer", label: "Fry onions", durationSeconds: 30 },
      ],
    },
    { id: "oil", text: "Add the remaining oil, then stir." },
    { id: "rest", text: "Leave to rest." },
  ],
};
if (new URLSearchParams(location.search).has("ambiguous")) {
  input.ingredients.push({
    id: "fresh",
    name: "fresh coriander",
    quantity: "1",
    unit: "bunch",
    note: "roughly chopped",
    group: "Garnish",
    shoppingCategory: "fruit_and_veg",
  });
  input.steps[0]!.text = "Add coriander and fry for 30 seconds.";
}
function Fixture() {
  const [meal, setMeal] = useState<CatalogueMeal>(() => ({
    id: "cook-fixture",
    version: 1,
    slug: "cook-fixture",
    position: 0,
    ...prepareRecipeContent(input),
  }));
  return (
    <>
      <button
        onClick={() =>
          setMeal({
            ...meal,
            version: 2,
            ingredients: meal.ingredients.map((line) => ({
              ...line,
              note: "changed after cook started",
            })),
          })
        }
      >
        Simulate backend update
      </button>
      <CookModePage meal={meal} catalogueVersion={meal.version} servings={4} />
    </>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
