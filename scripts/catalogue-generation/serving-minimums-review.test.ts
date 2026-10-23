import { expect, test } from "vitest";
import { recipeFingerprint } from "../../src/lib/domain/catalogue-generation";
import type { RecipeContent } from "../../src/lib/domain/recipes";
import {
  exportSchema,
  reviewSchema,
  prepareServingMinimumChanges,
} from "./serving-minimums-review";
const content: RecipeContent = {
  title: "Pie",
  servings: 4,
  proteinCategory: "beef",
  ingredients: [
    {
      id: "beef",
      name: "beef",
      quantity: "400",
      unit: "g",
      shoppingCategory: "meat_and_fish",
    },
  ],
  steps: [{ id: "bake", text: "Bake." }],
};
async function fixture() {
  const fingerprint = await recipeFingerprint(content);
  const resultFingerprint = await recipeFingerprint({
    ...content,
    minimumServings: 3,
  });
  const row = {
    catalogueMealId: "pie",
    version: 1,
    fingerprint,
    resultFingerprint,
    minimumServings: 3,
    reason: "Keep a practical pie size.",
  };
  return {
    review: reviewSchema.parse({
      reviewStatus: "approved",
      reviewedBy: "editor",
      rows: [row],
    }),
    current: [{ catalogueMealId: "pie", version: 1, fingerprint, content }],
  };
}
test("preflight accepts a reviewed change and an exact prior application", async () => {
  const { review, current } = await fixture();
  expect(await prepareServingMinimumChanges(review, current)).toEqual(
    review.rows,
  );
  const applied = [
    {
      ...current[0],
      version: 2,
      fingerprint: review.rows[0].resultFingerprint,
      content: { ...content, minimumServings: 3 },
    },
  ];
  expect(await prepareServingMinimumChanges(review, applied)).toEqual([]);
});
test("incorrect result fingerprints fail before any write", async () => {
  const { review, current } = await fixture();
  review.rows[0].resultFingerprint = "wrong";
  await expect(prepareServingMinimumChanges(review, current)).rejects.toThrow(
    "Expected result fingerprint",
  );
});
test("stale revisions with identical ingredients cannot bypass source review", async () => {
  const { review, current } = await fixture();
  current[0].version = 2;
  await expect(prepareServingMinimumChanges(review, current)).rejects.toThrow(
    "Stale review",
  );
});
test("review parsing rejects duplicates and exports validate complete content", async () => {
  const { review } = await fixture();
  expect(() =>
    reviewSchema.parse({ ...review, rows: [review.rows[0], review.rows[0]] }),
  ).toThrow("distinct");
  expect(() =>
    exportSchema.parse([
      {
        catalogueMealId: "bad",
        version: 1,
        fingerprint: "bad",
        content: { servings: 4 },
      },
    ]),
  ).toThrow("invalid recipe content");
});
