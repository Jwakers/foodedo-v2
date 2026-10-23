import { expect, test } from "vitest";
import { uniqueGeneratedTimerIds } from "./recipeTimers";
import {
  prepareRecipeContent,
  type RecipeStep,
} from "../../src/lib/domain/recipes";
const cue = { id: "cook", label: "Cook", durationSeconds: 600 };

test("repairs within-step and cross-step duplicates without stealing supplied unique IDs", () => {
  const steps: RecipeStep[] = [
    {
      id: "one",
      text: "Cook.",
      timerCues: [cue, { ...cue, label: "Rest", durationSeconds: 60 }],
    },
    {
      id: "two",
      text: "Simmer.",
      timerCues: [
        { ...cue, label: "Simmer" },
        { ...cue, id: "cook-2" },
      ],
    },
  ];
  const before = structuredClone(steps);
  const normalized = uniqueGeneratedTimerIds(steps);
  expect(
    normalized.flatMap((step) => step.timerCues?.map((timer) => timer.id)),
  ).toEqual(["cook", "cook-3", "cook-4", "cook-2"]);
  expect(steps).toEqual(before);
  expect(
    normalized.map((step) => ({
      ...step,
      timerCues: step.timerCues?.map(({ id, ...timer }) => {
        void id;
        return timer;
      }),
    })),
  ).toEqual(
    before.map((step) => ({
      ...step,
      timerCues: step.timerCues?.map(({ id, ...timer }) => {
        void id;
        return timer;
      }),
    })),
  );
  expect(uniqueGeneratedTimerIds(normalized)).toEqual(normalized);
});

test("retains the existing owner's ID when a new earlier step reuses it", () => {
  const previous: RecipeStep[] = [
    { id: "existing", text: "Simmer.", timerCues: [cue] },
  ];
  const steps = [
    { id: "new", text: "Fry.", timerCues: [{ ...cue, label: "Fry" }] },
    ...previous,
  ];
  const normalized = uniqueGeneratedTimerIds(steps, previous);
  expect(normalized[0].timerCues?.[0].id).toBe("cook-2");
  expect(normalized[1]).toEqual(previous[0]);
});

test("prefers an existing label when duplicated inside the same retained step", () => {
  const previous: RecipeStep[] = [
    { id: "existing", text: "Cook.", timerCues: [cue] },
  ];
  const normalized = uniqueGeneratedTimerIds(
    [{ ...previous[0], timerCues: [{ ...cue, label: "New phase" }, cue] }],
    previous,
  );
  expect(normalized[0].timerCues.map((timer) => timer.id)).toEqual([
    "cook-2",
    "cook",
  ]);
});

test("generated suffixes fit the recipe ID limit and validate successfully", () => {
  const long = "x".repeat(64);
  const normalized = uniqueGeneratedTimerIds([
    {
      id: "one",
      text: "Cook.",
      timerCues: [
        { ...cue, id: long },
        { ...cue, id: long },
        { ...cue, id: long.slice(0, 62) + "-2" },
      ],
    },
  ]);
  expect(normalized[0].timerCues.map((timer) => timer.id)).toEqual([
    long,
    long.slice(0, 62) + "-3",
    long.slice(0, 62) + "-2",
  ]);
  expect(() =>
    prepareRecipeContent({
      title: "Soup",
      proteinCategory: "meat-free",
      ingredients: [
        { id: "one", name: "carrot", shoppingCategory: "fruit_and_veg" },
      ],
      steps: normalized,
    }),
  ).not.toThrow();
});
