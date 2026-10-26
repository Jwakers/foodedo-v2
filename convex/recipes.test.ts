import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { personalRecipeBrowseKeys } from "./lib/recipeListing";
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

test("updating an imported recipe removes optional fields the owner cleared", async () => {
  const t = createTestContext();
  const { asUser, ownerId } = await seedUserAndRelease(t);
  const recipeId = await t.run(async (ctx) =>
    ctx.db.insert("recipes", {
      ownerId,
      title: "Imported pasta",
      description: "A weeknight dinner.",
      ingredients: [
        {
          id: "ingredient-1",
          name: "ingredient",
          shoppingCategory: "pantry",
        },
      ],
      steps: [{ id: "step-1", text: "Cook it." }],
      servings: 4,
      prepMinutes: 10,
      cookMinutes: 20,
      proteinCategory: "meat-free",
      costBand: "standard",
      notes: [{ id: "note-1", text: "Drain well." }],
      source: { type: "import", method: "url", importedAt: 1 },
      savedAt: 1,
      updatedAt: 1,
    }),
  );

  await asUser.mutation(api.recipes.updateImported, {
    recipeId,
    recipe: {
      title: "Imported pasta",
      ingredients: [
        {
          id: "ingredient-1",
          name: "ingredient",
          shoppingCategory: "pantry",
        },
      ],
      steps: [{ id: "step-1", text: "Cook it." }],
      proteinCategory: "meat-free",
    },
  });

  const updated = await t.run(async (ctx) => ctx.db.get(recipeId));
  expect(updated?.description).toBeUndefined();
  expect(updated?.servings).toBeUndefined();
  expect(updated?.prepMinutes).toBeUndefined();
  expect(updated?.cookMinutes).toBeUndefined();
  expect(updated?.costBand).toBeUndefined();
  expect(updated?.notes).toBeUndefined();
});

test("catalogue detail and personal snapshots preserve cooking notes and scaling restrictions", async () => {
  const t = createTestContext();
  const { asUser } = await seedUserAndRelease(t);
  const notes = [
    { id: "marinade", text: "Allow 2 hours for marinating before cooking." },
  ];
  await t.run(async (ctx) => {
    const meal = await ctx.db.query("catalogueMeals").first();
    await ctx.db.patch(meal!._id, { notes, servingScaling: "source_only" });
  });
  const detail = await t.query(api.catalogue.getMeal, {
    catalogueMealId,
    catalogueVersion: 2,
  });
  expect(detail?.notes).toEqual(notes);
  expect(detail?.servingScaling).toBe("source_only");
  await asUser.mutation(api.recipes.saveCatalogueMeal, {
    catalogueMealId,
    catalogueVersion: 2,
  });
  const snapshot = await t.run((ctx) => ctx.db.query("recipes").first());
  expect(snapshot?.notes).toEqual(notes);
  expect(snapshot?.servingScaling).toBe("source_only");
});

test("the first favourite retires its hint even after it is removed", async () => {
  const t = createTestContext();
  const { asUser } = await seedUserAndRelease(t);
  const saved = await asUser.mutation(api.recipes.saveCatalogueMeal, {
    catalogueMealId,
    catalogueVersion: 2,
  });
  if (saved.status !== "saved") throw new Error("Expected saved favourite");
  await asUser.mutation(api.recipes.removeMineFromLibrary, {
    recipeId: saved.recipeId,
  });
  expect(
    (await asUser.query(api.onboarding.getState, { authSubject }))?.retired,
  ).toContain("recipes");
  await expect(
    t.mutation(api.onboarding.retire, { authSubject, introductions: ["home"] }),
  ).rejects.toThrow();
});

test("removing a pre-onboarding favourite does not bring its hint back", async () => {
  const t = createTestContext();
  const { asUser, ownerId } = await seedUserAndRelease(t);
  const saved = await asUser.mutation(api.recipes.saveCatalogueMeal, {
    catalogueMealId,
    catalogueVersion: 2,
  });
  if (saved.status !== "saved") throw new Error("Expected a saved favourite");
  await t.run((ctx) => ctx.db.patch(ownerId, { onboarding: undefined }));
  expect(
    (await asUser.query(api.onboarding.getState, { authSubject }))?.retired,
  ).toContain("recipes");
  await asUser.mutation(api.recipes.removeMineFromLibrary, {
    recipeId: saved.recipeId,
  });
  expect(
    (await asUser.query(api.onboarding.getState, { authSubject }))?.retired,
  ).toContain("recipes");
});

test("personal pagination excludes saved catalogue snapshots before filling a page", async () => {
  const t = createTestContext();
  const { asUser, ownerId } = await seedUserAndRelease(t);
  await t.run(async (ctx) => {
    for (let i = 0; i < 43; i++) {
      await ctx.db.insert("recipes", {
        ownerId,
        title: `Recipe ${i}`,
        ingredients: [],
        steps: [],
        proteinCategory: "meat-free",
        source:
          i < 23
            ? { type: "manual" }
            : {
                type: "catalogue",
                catalogueMealId: `catalogue-${i}`,
                catalogueVersion: 1,
              },
        savedAt: i + 1,
        updatedAt: i + 1,
      });
    }
  });
  const first = await asUser.query(api.recipes.listMine, {
    paginationOpts: { numItems: 20, cursor: null },
    excludeCatalogue: true,
  });
  expect(first.page).toHaveLength(20);
  expect(first.page.every((recipe) => recipe.source.type === "manual")).toBe(
    true,
  );
  const second = await asUser.query(api.recipes.listMine, {
    paginationOpts: { numItems: 20, cursor: first.continueCursor },
    excludeCatalogue: true,
  });
  expect(second.page).toHaveLength(3);
  expect(second.isDone).toBe(true);
});

test("personal search, filters and sort operate before pagination across the whole library", async () => {
  const t = createTestContext();
  const { asUser, ownerId } = await seedUserAndRelease(t);
  await t.run(async (ctx) => {
    for (let i = 0; i < 45; i++) {
      const content = {
        title: i === 0 ? "Distant lemon dinner" : `Dinner ${i}`,
        cookMinutes: i + 1,
        costBand: i % 2 ? ("premium" as const) : ("budget" as const),
      };
      await ctx.db.insert("recipes", {
        ownerId,
        ...content,
        ...personalRecipeBrowseKeys(content),
        ingredients: [],
        steps: [],
        proteinCategory: "meat-free",
        source: { type: "manual" },
        savedAt: i + 1,
        updatedAt: i + 1,
      });
    }
  });
  const paginationOpts = { numItems: 20, cursor: null };
  const search = await asUser.query(api.recipes.listMine, {
    paginationOpts,
    excludeCatalogue: true,
    searchQuery: " LEMON ",
  });
  expect(search.page.map((recipe) => recipe.title)).toEqual([
    "Distant lemon dinner",
  ]);
  const quickest = await asUser.query(api.recipes.listMine, {
    paginationOpts,
    excludeCatalogue: true,
    sort: "quickest",
  });
  expect(quickest.page.map((recipe) => recipe.cookMinutes)).toEqual(
    Array.from({ length: 20 }, (_, i) => i + 1),
  );
  const filtered = await asUser.query(api.recipes.listMine, {
    paginationOpts,
    excludeCatalogue: true,
    budgetFriendly: true,
    under30Minutes: true,
    proteinCategories: ["meat-free"],
    sort: "quickest",
  });
  expect(filtered.page.map((recipe) => recipe.cookMinutes)).toEqual(
    Array.from({ length: 15 }, (_, i) => i * 2 + 1),
  );
  const cheapest = await asUser.query(api.recipes.listMine, {
    paginationOpts,
    excludeCatalogue: true,
    sort: "lowest-cost",
  });
  expect(cheapest.page.every((recipe) => recipe.costBand === "budget")).toBe(
    true,
  );
  expect(cheapest.page[0].cookMinutes).toBe(45);
});

test("large personal libraries do not consume the saved catalogue limit", async () => {
  const t = createTestContext();
  const { asUser, ownerId } = await seedUserAndRelease(t);
  await asUser.mutation(api.recipes.saveCatalogueMeal, {
    catalogueMealId,
    catalogueVersion: 2,
  });
  await t.run(async (ctx) => {
    for (let i = 0; i < 1001; i++) {
      await ctx.db.insert("recipes", {
        ownerId,
        title: `Personal recipe ${i}`,
        ingredients: [],
        steps: [],
        proteinCategory: "meat-free",
        source: { type: "manual" },
        savedAt: 1,
        updatedAt: 1,
      });
    }
  });
  const saved = await asUser.query(api.recipes.listSavedCatalogueMeals, {});
  expect(saved.map((recipe) => recipe.catalogueMealId)).toEqual([
    catalogueMealId,
  ]);
  const catalogue = await asUser.query(api.catalogue.list, {
    savedOnly: true,
    paginationOpts: { numItems: 20, cursor: null },
  });
  expect(catalogue.page.map((meal) => meal.id)).toEqual([catalogueMealId]);
});
