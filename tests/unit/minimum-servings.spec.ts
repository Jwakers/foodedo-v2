import { expect, test } from "@playwright/test";
import {
  minimumServingsNotice,
  recipeServingModel,
} from "../../src/lib/domain/ingredient-scaling";
import {
  prepareRecipeContent,
  prepareRecipeDraft,
  type CatalogueMeal,
} from "../../src/lib/domain/recipes";
import {
  emptyCookSession,
  restoreCookSession,
} from "../../src/lib/domain/cook-session";
import {
  culinaryContentChanged,
  recipeFingerprint,
} from "../../src/lib/domain/catalogue-generation";
import { resolveGuestPlanMealRows } from "../../src/lib/domain/plan-display";
import { createGuestDraft } from "../../src/lib/domain/guest-draft";

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
      unit: "g",
      shoppingCategory: "meat_and_fish",
    },
  ],
  steps: [{ id: "bake", text: "Bake until cooked through." }],
};

for (const [requested, cooking, quantity] of [
  [2, 4, "400"],
  [4, 4, "400"],
  [5, 5, "500"],
  [7, 7, "700"],
] as const) {
  test(`request ${requested} resolves to ${cooking} portions`, () => {
    expect(recipeServingModel(meal, requested)).toMatchObject({
      requestedServings: requested,
      cookingServings: cooking,
      ingredients: [{ quantity }],
    });
    expect(meal.ingredients[0].quantity).toBe("600");
  });
}
test("ordinary meals still scale to household servings", () => {
  expect(
    recipeServingModel({ ...meal, minimumServings: undefined }, 2)
      .ingredients[0].quantity,
  ).toBe("200");
});
test("source-only and unknown-yield recipes keep authored ingredients without leftover claims", () => {
  for (const recipe of [
    { ...meal, servingScaling: "source_only" as const },
    { ...meal, servings: undefined },
  ]) {
    expect(recipeServingModel(recipe, 2)).toMatchObject({
      canScale: false,
      ingredients: meal.ingredients,
    });
    expect(minimumServingsNotice(recipe, 2)).toBeNull();
  }
});
test("only known minimum adjustments explain leftovers", () => {
  expect(minimumServingsNotice(meal, 2)).toBe(
    "Makes 4 portions for 2 people — 2 portions left over.",
  );
  expect(minimumServingsNotice(meal, 3)).toContain("1 portion left over.");
  expect(minimumServingsNotice(meal, 5)).toBeNull();
});
test("minimum metadata validates independently of authored yield", () => {
  expect(prepareRecipeContent(meal).minimumServings).toBe(4);
  for (const minimumServings of [0, -1, 1.5, 7, 1001, NaN])
    expect(() => prepareRecipeContent({ ...meal, minimumServings })).toThrow();
  expect(() =>
    prepareRecipeContent({ ...meal, servings: undefined }),
  ).toThrow();
  expect(
    prepareRecipeDraft({ ...meal, servings: undefined }).minimumServings,
  ).toBe(4);
});
test("direct cook context and restored state cannot bypass a minimum", () => {
  const context = { meal, catalogueVersion: 1, servings: 2 };
  const session = emptyCookSession(context);
  expect(session.servings).toBe(4);
  expect(
    restoreCookSession({ ...session, servings: 2 }, context).servings,
  ).toBe(4);
  expect(restoreCookSession(session, context).servings).toBe(4);
});
test("minimum changes affect recipe fingerprint and culinary review", async () => {
  const next = { ...meal, minimumServings: 5 };
  expect(culinaryContentChanged(meal, next)).toBe(true);
  expect(await recipeFingerprint(meal)).not.toBe(await recipeFingerprint(next));
});

test("guest planning retains household count while exposing minimum metadata", () => {
  const draft = createGuestDraft({
    planStartDate: "2026-10-23",
    catalogueMeals: [
      {
        catalogueMealId: meal.id,
        catalogueVersion: meal.version,
        proteinCategory: meal.proteinCategory,
      },
    ],
    now: 1,
    servings: 2,
  });
  const rows = resolveGuestPlanMealRows({
    draft,
    mealsByReference: new Map([["lasagne:1", meal]]),
  });
  expect(draft.servings).toBe(2);
  expect(rows[0]).toMatchObject({
    requestedServings: 2,
    meal: { minimumServings: 4 },
  });
});

test("scaling an imported amount updates its rendered display text", () => {
  const recipe = {
    ...meal,
    ingredients: [
      { ...meal.ingredients[0], amountText: "600 g", sourceText: "600g mince" },
    ],
  };
  expect(recipeServingModel(recipe, 2).ingredients[0]).toMatchObject({
    quantity: "400",
    amountText: "400 g",
    sourceText: "600g mince",
  });
});

test("older imports default to source-only in the shared serving policy", () => {
  const imported = { ...meal, source: { type: "import" as const } };
  expect(recipeServingModel(imported, 2)).toMatchObject({
    canScale: false,
    cookingServings: 6,
    ingredients: meal.ingredients,
  });
  expect(minimumServingsNotice(imported, 2)).toBeNull();
  expect(
    recipeServingModel({ ...imported, servingScaling: "safe" }, 2)
      .cookingServings,
  ).toBe(4);
});

test("invalid requests do not leak into leftover descriptions", () => {
  for (const requested of [0, -2, NaN, Infinity, 1001])
    expect(minimumServingsNotice(meal, requested)).toBeNull();
  expect(minimumServingsNotice(meal, 2, 2)).toBeNull();
});
