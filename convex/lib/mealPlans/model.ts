import type { MealPreferenceSignals } from "../../../src/lib/domain/meal-selection-signals";
import type { Doc, Id } from "../../_generated/dataModel";

export const defaultPlanServings = 4;

export const minimumAdjustablePlanDays = 3;

export const maximumAdjustablePlanDays = 7;

export const maximumPersonalPlanCandidates = 50;

export type PlanRecipeReference =
  | { type: "existing"; recipeId: Id<"recipes"> }
  | {
      type: "catalogue";
      catalogueMealId: string;
      catalogueVersion: number;
    };

export type PlanRecipeChoice = {
  date: string;
  recipe: PlanRecipeReference;
  status: Doc<"mealSlots">["status"];
};

export type PlanCandidate = MealPreferenceSignals & {
  servings?: number;
  minimumServings?: number;
  servingScaling?: "safe" | "source_only";
  key: string;
  recipe: PlanRecipeReference;
  catalogueMealId: string | null;
  catalogueMealSlug: string | null;
  title: string;
  prepMinutes: number | null;
  cookMinutes: number | null;
  proteinCategory: Doc<"recipes">["proteinCategory"];
  isSaved: boolean;
};
