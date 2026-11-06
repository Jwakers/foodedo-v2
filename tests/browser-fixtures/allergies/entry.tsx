import { useState } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerTrigger,
} from "../../../src/components/ui/drawer";
import {
  DrawerStack,
  DrawerStackView,
} from "../../../src/components/ui/drawer-stack";
import { PlanMealSwap } from "../../../src/features/plan/plan-meal-swap";
import { createRoot } from "react-dom/client";
import { AllergyProvider } from "../../../src/features/allergies/allergy-context";
import { PlanSetupForm } from "../../../src/features/plan/plan-setup-form";
import { RecipeCard } from "../../../src/features/recipes/recipe-card";
import { RecipeDetailContent } from "../../../src/features/recipes/recipe-detail-content";
import { recipeAllergyEvidence } from "../../../src/lib/domain/allergies";
import type { CatalogueMeal } from "../../../src/lib/domain/recipes";
import { ActivePlanAdjustDrawer } from "../../../src/features/plan/active-plan-adjust-drawer";
import { counts, read, update } from "./state";
declare global {
  interface Window {
    allergyFixture: {
      counts: typeof counts;
      read: typeof read;
      update: typeof update;
    };
  }
}
window.allergyFixture = { counts, read, update };
const meal: CatalogueMeal = {
  id: "creamy-potatoes",
  slug: "creamy-potatoes",
  version: 1,
  position: 0,
  title: "Creamy potatoes",
  proteinCategory: "meat-free",
  servings: 4,
  ingredients: [
    {
      id: "cream",
      name: "cream",
      quantity: "200",
      unit: "ml",
      shoppingCategory: "dairy_and_eggs",
    },
    {
      id: "potato",
      name: "potatoes",
      quantity: "500",
      unit: "g",
      shoppingCategory: "fruit_and_veg",
    },
  ],
  steps: [{ id: "s", text: "Cook the potatoes." }],
};
function RecipePicker() {
  const [open, setOpen] = useState(false);
  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger>Open recipe picker</DrawerTrigger>
      <DrawerContent>
        <DrawerStack rootId="picker">
          <DrawerStackView id="picker">
            <PlanMealSwap
              date="2030-11-04"
              onOpenPreview={() => {}}
              onSwap={(id) => {
                counts.choices.push(id);
                setOpen(false);
              }}
            />
          </DrawerStackView>
        </DrawerStack>
      </DrawerContent>
    </Drawer>
  );
}
createRoot(document.getElementById("root")!).render(
  <AllergyProvider>
    <RecipePicker />
    <ActivePlanAdjustDrawer
      plan={{
        _id: "plan",
        startDate: "2030-11-04",
        endDate: "2030-11-06",
        servings: 4,
        updatedAt: 1,
      }}
      disabled={false}
    />
    <PlanSetupForm
      title="Plan your week"
      description="Make dinner easier."
      initialSetup={{
        planDays: 3,
        startDate: "2030-11-04",
        servings: 4,
        prioritiseSavedRecipes: true,
      }}
      canRemember={false}
      showSavedRecipes={false}
      isHousehold={false}
      onGenerate={async () => {}}
    />
    <div
      className="mx-auto grid max-w-175 grid-cols-2 gap-4 px-page-inline"
      data-testid="recipe-grid"
    >
      <RecipeCard
        title={meal.title}
        meta="30 min"
        allergyEvidence={recipeAllergyEvidence(meal)}
        saved={false}
        showSave={false}
        onToggleSave={() => {}}
      />
      <RecipeCard
        title="Rice"
        meta="20 min"
        allergyEvidence={{ allergenIds: [], possibleAllergenIds: [] }}
        saved={false}
        showSave={false}
        onToggleSave={() => {}}
      />
    </div>
    <RecipeDetailContent meal={meal} presentation="page" />
  </AllergyProvider>,
);
