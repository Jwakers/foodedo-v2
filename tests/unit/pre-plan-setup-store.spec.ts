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

test("keeps context-specific overrides and clears only the originating context", () => {
  const privateKey = "account-one:private";
  const householdKey = "account-one:household";
  const privateSetup = {
    planDays: 3 as const,
    startDate: "2026-10-21",
    servings: 1,
    prioritiseSavedRecipes: true,
  };
  const householdSetup = { ...privateSetup, planDays: 7 as const, servings: 4 };
  setPendingPrePlanSetup(privateSetup, privateKey);
  setPendingPrePlanSetup(householdSetup, householdKey);
  expect(getPendingPrePlanSetup(privateKey)).toEqual(privateSetup);
  expect(getPendingPrePlanSetup(householdKey)).toEqual(householdSetup);
  clearPendingPrePlanSetup(householdKey);
  expect(getPendingPrePlanSetup(privateKey)).toEqual(privateSetup);
  expect(getPendingPrePlanSetup(householdKey)).toBeNull();
  clearPendingPrePlanSetup(privateKey);
});
