import { expect, test } from "@playwright/test";

import { savedPlanMealChoices } from "../../src/features/plan/saved-plan-meal-choices";

test("normalises sparse saved slots into one seven-day choice window", () => {
  const choices = savedPlanMealChoices({
    planStartDate: "2026-08-29",
    mealSlots: [
      { date: "2026-08-29", catalogueMealId: "meal-one" },
      { date: "2026-08-31", catalogueMealId: "meal-three" },
      { date: "2026-09-05", catalogueMealId: "outside-window" },
    ],
  });

  expect(choices).toEqual([
    { date: "2026-08-29", catalogueMealId: "meal-one" },
    { date: "2026-08-30", catalogueMealId: null },
    { date: "2026-08-31", catalogueMealId: "meal-three" },
    { date: "2026-09-01", catalogueMealId: null },
    { date: "2026-09-02", catalogueMealId: null },
    { date: "2026-09-03", catalogueMealId: null },
    { date: "2026-09-04", catalogueMealId: null },
  ]);
});
