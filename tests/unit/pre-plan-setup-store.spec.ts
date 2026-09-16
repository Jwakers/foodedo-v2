import { expect, test } from "@playwright/test";

import {
  clearPendingPrePlanSetup,
  getPendingPrePlanSetup,
  setPendingPrePlanSetup,
  subscribeToPendingPrePlanSetup,
} from "../../src/features/plan/pre-plan-setup-store";

test("shares one pending pre-plan setup and notifies every surface", () => {
  clearPendingPrePlanSetup();
  let homeUpdates = 0;
  let weekUpdates = 0;
  const unsubscribeHome = subscribeToPendingPrePlanSetup(() => {
    homeUpdates += 1;
  });
  const unsubscribeWeek = subscribeToPendingPrePlanSetup(() => {
    weekUpdates += 1;
  });
  const setup = {
    planDays: 3 as const,
    startDate: "2026-09-20",
    servings: 2,
    prioritiseSavedRecipes: false,
  };

  setPendingPrePlanSetup(setup);

  expect(getPendingPrePlanSetup()).toEqual(setup);
  expect({ homeUpdates, weekUpdates }).toEqual({
    homeUpdates: 1,
    weekUpdates: 1,
  });

  unsubscribeHome();
  unsubscribeWeek();
  clearPendingPrePlanSetup();
});
