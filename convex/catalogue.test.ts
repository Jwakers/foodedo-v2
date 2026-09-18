import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

function createTestContext() {
  return convexTest(schema, modules);
}

async function seedMeal(
  t: ReturnType<typeof createTestContext>,
  {
    version,
    status,
    mealId,
    slug,
    position = 0,
    withImage = status !== "staging",
    withPublishedAt = status !== "staging",
  }: {
    version: number;
    status: "staging" | "published" | "retired";
    mealId: string;
    slug: string;
    position?: number;
    withImage?: boolean;
    withPublishedAt?: boolean;
  },
) {
  await t.run(async (ctx) => {
    const imageStorageId = withImage
      ? await ctx.storage.store(new Blob(["image"], { type: "image/webp" }))
      : undefined;
    await ctx.db.insert("catalogueMeals", {
      catalogueMealId: mealId,
      version,
      status,
      slug,
      position,
      title: `Meal ${version}`,
      description: "A synthetic catalogue recipe.",
      ingredients: [
        {
          id: "ingredient-1",
          name: "ingredient",
          shoppingCategory: "pantry",
        },
      ],
      steps: [{ id: "step-1", text: "Cook it." }],
      servings: 4,
      prepMinutes: 5,
      cookMinutes: 10,
      proteinCategory: "meat-free",
      costBand: "budget",
      ...(imageStorageId === undefined ? {} : { imageStorageId }),
      createdAt: version,
      ...(withPublishedAt ? { publishedAt: version + 1 } : {}),
    });
  });
}

test("current reads expose each independently published meal", async () => {
  const t = createTestContext();
  await seedMeal(t, {
    version: 1,
    status: "retired",
    mealId: "stable-meal",
    slug: "stable-meal-v1",
  });
  await seedMeal(t, {
    version: 2,
    status: "published",
    mealId: "stable-meal",
    slug: "stable-meal",
    withImage: true,
  });
  await seedMeal(t, {
    version: 1,
    status: "published",
    mealId: "another-meal",
    slug: "another-meal",
    position: 1,
  });
  await seedMeal(t, {
    version: 3,
    status: "staging",
    mealId: "staged-meal",
    slug: "staged-meal",
    position: 2,
  });

  const current = await t.query(api.catalogue.getCurrent, {});
  expect(current).toMatchObject({
    meals: [
      { id: "stable-meal", version: 2, slug: "stable-meal", position: 0 },
      { id: "another-meal", version: 1, slug: "another-meal", position: 1 },
    ],
  });
  expect(current?.meals[0]?.imageSrc).toMatch(/^https?:\/\//);
  await expect(
    t.query(api.catalogue.getCurrentMealBySlug, { slug: "staged-meal" }),
  ).resolves.toBeNull();
});

test("retired exact meal revisions remain readable", async () => {
  const t = createTestContext();
  await seedMeal(t, {
    version: 1,
    status: "retired",
    mealId: "stable-meal",
    slug: "stable-meal-v1",
  });
  await seedMeal(t, {
    version: 2,
    status: "published",
    mealId: "stable-meal",
    slug: "stable-meal",
  });

  await expect(
    t.query(api.catalogue.getMeal, {
      catalogueMealId: "stable-meal",
      catalogueVersion: 1,
    }),
  ).resolves.toMatchObject({
    id: "stable-meal",
    version: 1,
    slug: "stable-meal-v1",
    ingredients: [{ id: "ingredient-1" }],
    steps: [{ id: "step-1" }],
  });
  await expect(
    t.query(api.catalogue.getMeals, {
      meals: [
        { catalogueMealId: "stable-meal", catalogueVersion: 1 },
        { catalogueMealId: "stable-meal", catalogueVersion: 2 },
      ],
    }),
  ).resolves.toMatchObject([
    { id: "stable-meal", version: 1 },
    { id: "stable-meal", version: 2 },
  ]);
});

test("staging meal revisions are not publicly readable", async () => {
  const t = createTestContext();
  await seedMeal(t, {
    version: 3,
    status: "staging",
    mealId: "staged-meal",
    slug: "staged-meal",
  });

  await expect(
    t.query(api.catalogue.getMeal, {
      catalogueMealId: "staged-meal",
      catalogueVersion: 3,
    }),
  ).resolves.toBeNull();
});

test("exact revision reads are bounded and reject duplicates", async () => {
  const t = createTestContext();
  await expect(
    t.query(api.catalogue.getMeals, {
      meals: Array.from({ length: 21 }, (_, index) => ({
        catalogueMealId: `meal-${index}`,
        catalogueVersion: 1,
      })),
    }),
  ).rejects.toThrow("At most 20");

  await expect(
    t.query(api.catalogue.getMeals, {
      meals: [
        { catalogueMealId: "same-meal", catalogueVersion: 1 },
        { catalogueMealId: "same-meal", catalogueVersion: 1 },
      ],
    }),
  ).rejects.toThrow("must be unique");
});

test("current catalogue rejects multiple published revisions of one meal", async () => {
  const t = createTestContext();
  await seedMeal(t, {
    version: 1,
    status: "published",
    mealId: "stable-meal",
    slug: "stable-meal-v1",
  });
  await seedMeal(t, {
    version: 2,
    status: "published",
    mealId: "stable-meal",
    slug: "stable-meal-v2",
    position: 1,
  });

  await expect(t.query(api.catalogue.getCurrent, {})).rejects.toThrow(
    "multiple published revisions",
  );
});

test("current catalogue rejects incomplete published meals", async () => {
  const missingImage = createTestContext();
  await seedMeal(missingImage, {
    version: 1,
    status: "published",
    mealId: "missing-image",
    slug: "missing-image",
    withImage: false,
  });
  await expect(
    missingImage.query(api.catalogue.getCurrent, {}),
  ).rejects.toThrow("must have an image");

  const missingPublicationTime = createTestContext();
  await seedMeal(missingPublicationTime, {
    version: 1,
    status: "published",
    mealId: "missing-publication-time",
    slug: "missing-publication-time",
    withPublishedAt: false,
  });
  await expect(
    missingPublicationTime.query(api.catalogue.getCurrent, {}),
  ).rejects.toThrow("must have a publication time");
});
