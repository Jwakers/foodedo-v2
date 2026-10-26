import { expect, test } from "@playwright/test";
import { selectDiscoveryMeals } from "../../src/lib/domain/recipe-discovery";
import {
  PROTEIN_CATEGORIES,
  type CatalogueMealSummary,
} from "../../src/lib/domain/recipes";

const meal = (
  id: string,
  overrides: Partial<CatalogueMealSummary> = {},
): CatalogueMealSummary => ({
  id,
  slug: id,
  version: 1,
  position: 0,
  title: id,
  proteinCategory: "chicken",
  ...overrides,
});
const pool = Array.from({ length: 32 }, (_, index) =>
  meal(`meal-${index}`, {
    proteinCategory: PROTEIN_CATEGORIES[index % PROTEIN_CATEGORIES.length],
  }),
);
const defaults = {
  savedMealIds: new Set<string>(),
  plannedMealIds: new Set<string>(),
  day: "2026-10-26",
  viewerKey: "alice",
};
const ids = (meals: CatalogueMealSummary[]) => meals.map((meal) => meal.id);

test("daily selection is deterministic, independent of catalogue order, and rotates", () => {
  const first = selectDiscoveryMeals(pool, defaults);
  expect(first).toHaveLength(6);
  expect(selectDiscoveryMeals([...pool].reverse(), defaults)).toEqual(first);
  expect(
    ids(selectDiscoveryMeals(pool, { ...defaults, day: "2026-10-27" })),
  ).not.toEqual(ids(first));
  expect(
    ids(selectDiscoveryMeals(pool, { ...defaults, viewerKey: "bob" })),
  ).not.toEqual(ids(first));
});

test("saved and planned meals are hard exclusions, including revised recipes", () => {
  const result = selectDiscoveryMeals(
    [meal("saved", { version: 5 }), meal("planned"), meal("new")],
    {
      ...defaults,
      savedMealIds: new Set(["saved"]),
      plannedMealIds: new Set(["planned"]),
    },
  );
  expect(ids(result)).toEqual(["new"]);
});

test("cold starts offer variety and never repeat candidates to fill the row", () => {
  const result = selectDiscoveryMeals(pool, defaults);
  expect(new Set(result.map((meal) => meal.proteinCategory)).size).toBe(6);
  expect(selectDiscoveryMeals([], defaults)).toEqual([]);
  expect(
    ids(selectDiscoveryMeals([meal("only"), meal("only")], defaults)),
  ).toEqual(["only"]);
  expect(
    selectDiscoveryMeals([meal("saved")], {
      ...defaults,
      savedMealIds: new Set(["saved"]),
    }),
  ).toEqual([]);
});

test("taste gently favours familiar protein while retaining other categories", () => {
  const saved = meal("saved");
  const result = selectDiscoveryMeals(
    [
      saved,
      meal("chicken-a"),
      meal("chicken-b"),
      meal("fish", { proteinCategory: "fish" }),
      meal("beans", { proteinCategory: "meat-free" }),
    ],
    {
      ...defaults,
      savedMealIds: new Set([saved.id]),
    },
  );
  expect(result[0]?.proteinCategory).toBe("chicken");
  expect(result.slice(0, 3).map((meal) => meal.proteinCategory)).toEqual(
    expect.arrayContaining(["chicken", "fish", "meat-free"]),
  );
});

for (const signal of ["time", "cost"] as const) {
  test(`uses ${signal} affinity without needing a protein match`, () => {
    const traits =
      signal === "time" ? { cookMinutes: 20 } : { costBand: "budget" as const };
    const saved = meal("saved", { proteinCategory: "fish", ...traits });
    const result = selectDiscoveryMeals(
      [saved, meal("match", traits), meal("unknown")],
      { ...defaults, savedMealIds: new Set([saved.id]) },
    );
    expect(result[0]?.id).toBe("match");
  });
}

test("unknown metadata is not a preference and a zero-minute duration is known", () => {
  const saved = meal("saved", { proteinCategory: "fish" });
  const candidates = [
    saved,
    meal("unknown"),
    meal("known", { cookMinutes: 10, costBand: "standard" }),
  ];
  const unknown = selectDiscoveryMeals(candidates, {
    ...defaults,
    savedMealIds: new Set([saved.id]),
  });
  expect(ids(unknown)).toEqual(
    ids(selectDiscoveryMeals(candidates.slice(1), defaults)),
  );
  expect(
    selectDiscoveryMeals(
      [
        meal("saved", { cookMinutes: 0 }),
        meal("zero", { prepMinutes: 0 }),
        meal("slow", { cookMinutes: 90 }),
      ],
      { ...defaults, savedMealIds: new Set(["saved"]) },
    )[0]?.id,
  ).toBe("zero");
});

test("the third slot explores beyond the strongest remaining taste match", () => {
  const meals = [
    meal("saved", { cookMinutes: 20, costBand: "budget" }),
    ...pool,
  ];
  const result = selectDiscoveryMeals(meals, {
    ...defaults,
    savedMealIds: new Set(["saved"]),
  });
  expect(new Set(result.map((meal) => meal.proteinCategory)).size).toBe(6);
  expect(ids(result)).not.toContain("saved");
});
