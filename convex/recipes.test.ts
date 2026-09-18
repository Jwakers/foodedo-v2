import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const authSubject = "recipe-test-user";
const catalogueMealId = "stable-catalogue-meal";

function createTestContext() {
  return convexTest(schema, modules);
}

async function seedUserAndRelease(
  t: ReturnType<typeof createTestContext>,
  version = 2,
  status: "published" | "retired" = "published",
) {
  const ownerId = await t.run(async (ctx) => {
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_auth_subject", (q) => q.eq("authSubject", authSubject))
      .unique();
    const userId =
      existingUser?._id ??
      (await ctx.db.insert("users", {
        authSubject,
        email: "recipe-test@example.com",
        name: "Recipe test user",
        createdAt: 1,
        updatedAt: 1,
      }));
    const imageStorageId = await ctx.storage.store(
      new Blob(["image"], { type: "image/webp" }),
    );
    await ctx.db.insert("catalogueMeals", {
      catalogueMealId,
      version,
      status,
      slug: `stable-meal-v${version}`,
      position: 0,
      title: `Stable meal version ${version}`,
      ingredients: [
        {
          id: "ingredient-1",
          name: "ingredient",
          shoppingCategory: "pantry",
        },
      ],
      steps: [{ id: "step-1", text: "Cook it." }],
      servings: 4,
      proteinCategory: "meat-free",
      imageStorageId,
      createdAt: version,
      publishedAt: version + 1,
    });
    return userId;
  });
  return { ownerId, asUser: t.withIdentity({ subject: authSubject }) };
}

test("catalogue saving is idempotent and stable across newer revisions", async () => {
  const t = createTestContext();
  const { asUser } = await seedUserAndRelease(t);

  const first = await asUser.mutation(api.recipes.saveCatalogueMeal, {
    catalogueMealId,
    catalogueVersion: 2,
  });
  expect(first).toMatchObject({ status: "saved", created: true });

  const retry = await asUser.mutation(api.recipes.saveCatalogueMeal, {
    catalogueMealId,
    catalogueVersion: 2,
  });
  expect(retry).toEqual({ ...first, created: false });

  await t.run(async (ctx) => {
    const version2 = await ctx.db
      .query("catalogueMeals")
      .withIndex("by_meal_id_and_version", (q) =>
        q.eq("catalogueMealId", catalogueMealId).eq("version", 2),
      )
      .unique();
    await ctx.db.patch(version2!._id, { status: "retired" });
  });
  await seedUserAndRelease(t, 3);

  const newer = await asUser.mutation(api.recipes.saveCatalogueMeal, {
    catalogueMealId,
    catalogueVersion: 3,
  });
  expect(newer).toEqual({ ...first, created: false });

  const recipes = await t.run(async (ctx) => ctx.db.query("recipes").collect());
  expect(recipes).toHaveLength(1);
  expect(recipes[0]?.source).toEqual({
    type: "catalogue",
    catalogueMealId,
    catalogueVersion: 2,
  });
});

test("saving promotes an exact plan-only snapshot into the library", async () => {
  const t = createTestContext();
  const { asUser, ownerId } = await seedUserAndRelease(t);
  const recipeId = await t.run(async (ctx) =>
    ctx.db.insert("recipes", {
      ownerId,
      title: "Plan snapshot",
      ingredients: [
        {
          id: "ingredient-1",
          name: "ingredient",
          shoppingCategory: "pantry",
        },
      ],
      steps: [{ id: "step-1", text: "Cook it." }],
      proteinCategory: "meat-free",
      source: { type: "catalogue", catalogueMealId, catalogueVersion: 2 },
      updatedAt: 1,
    }),
  );

  const before = await asUser.query(api.recipes.listMine, {
    paginationOpts: { numItems: 10, cursor: null },
  });
  expect(before.page).toHaveLength(0);

  await expect(
    asUser.mutation(api.recipes.saveCatalogueMeal, {
      catalogueMealId,
      catalogueVersion: 2,
    }),
  ).resolves.toEqual({ status: "saved", recipeId, created: false });

  const saved = await asUser.query(api.recipes.listSavedCatalogueMeals, {});
  expect(saved).toEqual([{ catalogueMealId, recipeId }]);
});
