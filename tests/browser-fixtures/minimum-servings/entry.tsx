import { createRoot } from "react-dom/client";
import { RecipeDetailContent } from "../../../src/features/recipes/recipe-detail-content";
import { CookModePage } from "../../../src/features/cook/cook-mode-page";
import { usePathname, useSearchParams } from "../household/navigation";
import type { CatalogueMeal } from "../../../src/lib/domain/recipes";
const meal: CatalogueMeal = {
  id: "lasagne",
  slug: "lasagne",
  version: 1,
  position: 0,
  title: "Lasagne",
  servings: 6,
  minimumServings: 4,
  proteinCategory: "beef",
  ingredients: [
    {
      id: "mince",
      name: "mince",
      quantity: "600",
      amountText: "600 g",
      unit: "g",
      shoppingCategory: "meat_and_fish",
    },
  ],
  steps: [{ id: "bake", text: "Bake until cooked through." }],
};
function Fixture() {
  const pathname = usePathname();
  const params = useSearchParams();
  const servings = Number(params.get("servings") ?? 2);
  return pathname.includes("/cook") ? (
    <CookModePage meal={meal} catalogueVersion={1} servings={servings} />
  ) : (
    <RecipeDetailContent
      meal={meal}
      presentation="page"
      initialServings={servings}
      planServings={2}
      personalRecipeId="fixture-recipe"
      householdSnapshot
    />
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
