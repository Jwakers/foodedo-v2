import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

function createTestContext() {
  return convexTest(schema, modules);
}

const content = {
  title: "Migration meal",
  ingredients: [
    {
      id: "ingredient-1",
      name: "beans",
      shoppingCategory: "pantry" as const,
      quantity: "1",
      unit: "can",
    },
  ],
  steps: [{ id: "step-1", text: "Cook for 10 minutes." }],
  servings: 4,
  prepMinutes: 5,
  cookMinutes: 10,
  proteinCategory: "meat-free" as const,
  costBand: "budget" as const,
  servingScaling: "safe" as const,
};

test("scoped clear preserves catalogue images referenced by personal recipes", async () => {
  const t = createTestContext();
  const seeded = await t.run(async (ctx) => {
    const sharedImage = await ctx.storage.store(
      new Blob(["shared"], { type: "image/webp" }),
    );
    const unreferencedImage = await ctx.storage.store(
      new Blob(["unreferenced"], { type: "image/webp" }),
    );
    const ownerId = await ctx.db.insert("users", {
      authSubject: "user",
      email: null,
      name: null,
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.insert("recipes", {
      ownerId,
      ...content,
      imageStorageId: sharedImage,
      source: {
        type: "catalogue",
        catalogueMealId: "shared",
        catalogueVersion: 2,
      },
      savedAt: 1,
      updatedAt: 1,
    });
    for (const [index, imageStorageId] of [
      sharedImage,
      unreferencedImage,
    ].entries()) {
      await ctx.db.insert("catalogueMeals", {
        catalogueMealId: `meal-${index}`,
        version: 2,
        status: "published",
        slug: `meal-${index}`,
        position: index,
        ...content,
        imageStorageId,
        createdAt: 1,
        publishedAt: 2,
      });
    }
    return { sharedImage, unreferencedImage };
  });

  await expect(
    t.mutation(internal.catalogueMigration.clearCatalogue, {
      expectedCount: 3,
    }),
  ).rejects.toThrow("expected 3 rows but found 2");

  await expect(
    t.mutation(internal.catalogueMigration.clearCatalogue, {
      expectedCount: 2,
    }),
  ).resolves.toEqual({
    deletedRows: 2,
    deletedImages: 1,
    preservedImages: 1,
    personalRecipeCount: 1,
  });

  await t.run(async (ctx) => {
    expect(await ctx.db.query("catalogueMeals").collect()).toHaveLength(0);
    expect(
      await ctx.db.system.get("_storage", seeded.sharedImage),
    ).not.toBeNull();
    expect(
      await ctx.db.system.get("_storage", seeded.unreferencedImage),
    ).toBeNull();
    expect(await ctx.db.query("recipes").collect()).toHaveLength(1);
  });
});

test("staging is idempotent and publication is complete and ordered", async () => {
  const t = createTestContext();
  const imageStorageId = await t.run((ctx) =>
    ctx.storage.store(new Blob(["image"], { type: "image/webp" })),
  );
  const meal = {
    catalogueMealId: "migration-meal",
    version: 1,
    slug: "migration-meal",
    position: 99,
    content,
    imageStorageId,
    createdAt: 10,
  };

  await expect(
    t.mutation(internal.catalogueMigration.stageBatch, { meals: [meal] }),
  ).resolves.toEqual({ inserted: 1, unchanged: 0 });
  await expect(
    t.mutation(internal.catalogueMigration.stageBatch, { meals: [meal] }),
  ).resolves.toEqual({ inserted: 0, unchanged: 1 });
  await expect(
    t.query(internal.catalogueMigration.auditStaging, {}),
  ).resolves.toEqual({ stagingCount: 1, publishedCount: 0, errors: [] });

  await expect(
    t.mutation(internal.catalogueMigration.publishStaging, {
      orderedMealIds: [],
      publishedAt: 20,
    }),
  ).rejects.toThrow("include every staging meal");

  await expect(
    t.mutation(internal.catalogueMigration.publishStaging, {
      orderedMealIds: ["migration-meal"],
      publishedAt: 20,
    }),
  ).resolves.toEqual({ published: 1, publishedAt: 20 });

  await t.run(async (ctx) => {
    const published = await ctx.db.query("catalogueMeals").collect();
    expect(published).toMatchObject([
      { status: "published", position: 0, publishedAt: 20 },
    ]);
  });
});

test("review cleanup removes only staging rows and unreferenced images", async () => {
  const t = createTestContext();
  const [keepImage, removeImage] = await t.run(async (ctx) => [
    await ctx.storage.store(new Blob(["keep"], { type: "image/webp" })),
    await ctx.storage.store(new Blob(["remove"], { type: "image/webp" })),
  ]);
  await t.mutation(internal.catalogueMigration.stageBatch, {
    meals: [
      {
        catalogueMealId: "keep",
        version: 1,
        slug: "keep",
        position: 0,
        content,
        imageStorageId: keepImage,
        createdAt: 1,
      },
      {
        catalogueMealId: "remove",
        version: 1,
        slug: "remove",
        position: 1,
        content,
        imageStorageId: removeImage,
        createdAt: 1,
      },
    ],
  });

  await expect(
    t.mutation(internal.catalogueMigration.replaceStagingBatch, {
      keep: [
        {
          catalogueMealId: "keep",
          version: 1,
          slug: "kept-and-reviewed",
          content: { ...content, costBand: "standard" },
        },
      ],
      remove: [{ catalogueMealId: "remove", version: 1 }],
    }),
  ).resolves.toEqual({ kept: 1, removed: 1 });

  await t.run(async (ctx) => {
    const meals = await ctx.db.query("catalogueMeals").collect();
    expect(meals).toMatchObject([
      {
        catalogueMealId: "keep",
        slug: "kept-and-reviewed",
        costBand: "standard",
      },
    ]);
    expect(await ctx.db.system.get("_storage", keepImage)).not.toBeNull();
    expect(await ctx.db.system.get("_storage", removeImage)).toBeNull();
  });
});
