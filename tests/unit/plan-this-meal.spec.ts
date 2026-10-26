import { expect, test } from "@playwright/test";

import {
  nextPlanDay,
  planMealOptions,
} from "../../src/lib/domain/plan-this-meal";

test("returns the next date only for plans shorter than seven days", () => {
  expect(nextPlanDay({ startDate: "2026-09-29", endDate: "2026-10-01" })).toBe(
    "2026-10-02",
  );
  expect(
    nextPlanDay({ startDate: "2026-09-29", endDate: "2026-10-05" }),
  ).toBeNull();
});

test("lists every slot, including elapsed and empty slots", () => {
  expect(
    planMealOptions({
      startDate: "2026-09-27",
      endDate: "2026-10-01",
      slots: [
        { date: "2026-09-27", catalogueMealId: "meal-a", title: "Meal A" },
        { date: "2026-09-29", catalogueMealId: "meal-b", title: "Meal B" },
        { date: "2026-10-01", catalogueMealId: null, title: "My own recipe" },
      ],
    }),
  ).toEqual([
    {
      date: "2026-09-27",
      planned: { catalogueMealId: "meal-a", title: "Meal A" },
    },
    { date: "2026-09-28", planned: null },
    {
      date: "2026-09-29",
      planned: { catalogueMealId: "meal-b", title: "Meal B" },
    },
    { date: "2026-09-30", planned: null },
    {
      date: "2026-10-01",
      planned: { catalogueMealId: null, title: "My own recipe" },
    },
  ]);
});

test("retains all slots of a fully elapsed plan", () => {
  expect(
    planMealOptions({
      startDate: "2026-09-20",
      endDate: "2026-09-26",
      slots: [],
    }),
  ).toEqual(
    Array.from({ length: 7 }, (_, i) => ({
      date: `2026-09-${20 + i}`,
      planned: null,
    })),
  );
});
