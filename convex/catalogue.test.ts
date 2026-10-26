import type { FunctionReturnType } from "convex/server";
import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { catalogueBrowseKeys } from "./lib/catalogue";
import { api, internal } from "./_generated/api";
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

async function seedBrowseCatalogue(t: ReturnType<typeof createTestContext>) {
  for (let position = 0; position < 45; position++) {
    await seedMeal(t, {
      version: 1,
      status: "published",
      mealId: `meal-${position}`,
      slug: `meal-${position}`,
      position,
    });
  }
  await t.run(async (ctx) => {
    for (const meal of await ctx.db.query("catalogueMeals").collect()) {
      const metadata = {
        prepMinutes: undefined,
        cookMinutes: meal.position === 0 ? undefined : 50 - meal.position,
        costBand:
          meal.position % 2 ? ("premium" as const) : ("budget" as const),
        title: `Dinner ${meal.position}`,
        description: meal.position >= 20 ? "Lemony pasta" : "Roast dinner",
      };
      await ctx.db.patch(meal._id, {
        ...metadata,
        ...catalogueBrowseKeys(metadata),
      });
    }
  });
}

test("catalogue browsing shows newest additions first across 20-item pages and hides unpublished revisions", async () => {
  const t = createTestContext();
  await seedBrowseCatalogue(t);
  await seedMeal(t, {
    version: 2,
    status: "staging",
    mealId: "staging",
    slug: "staging",
    position: 46,
  });
  await seedMeal(t, {
    version: 1,
    status: "retired",
    mealId: "retired",
    slug: "retired",
    position: 47,
  });
  const ids: string[] = [];
  let cursor: string | null = null;
  for (const expectedSize of [20, 20, 5]) {
    const result: FunctionReturnType<typeof api.catalogue.list> = await t.query(
      api.catalogue.list,
      {
        paginationOpts: { numItems: 20, cursor },
      },
    );
    expect(result.page).toHaveLength(expectedSize);
    expect(result.isDone).toBe(expectedSize === 5);
    ids.push(...result.page.map((meal) => meal.id));
    cursor = result.continueCursor;
  }
  expect(ids).toEqual(Array.from({ length: 45 }, (_, i) => `meal-${44 - i}`));
});

test("search, combined filters and sorting apply across the catalogue before pagination", async () => {
  const t = createTestContext();
  await seedBrowseCatalogue(t);
  const paginationOpts = { numItems: 20, cursor: null };
  const filtered = await t.query(api.catalogue.list, {
    paginationOpts,
    searchQuery: " LEMONY ",
    under30Minutes: true,
    budgetFriendly: true,
    proteinCategories: ["meat-free"],
    sort: "quickest",
  });
  expect(filtered.page.map((meal) => meal.position)).toEqual([
    44, 42, 40, 38, 36, 34, 32, 30, 28, 26, 24, 22, 20,
  ]);
  expect(filtered.isDone).toBe(true);
  const sorted = await t.query(api.catalogue.list, {
    paginationOpts,
    sort: "quickest",
  });
  expect(sorted.page.map((meal) => meal.position)).toEqual(
    Array.from({ length: 20 }, (_, i) => 44 - i),
  );
  const cheapest = await t.query(api.catalogue.list, {
    paginationOpts,
    sort: "lowest-cost",
  });
  expect(cheapest.page.map((meal) => meal.position)).toEqual(
    Array.from({ length: 20 }, (_, i) => i * 2),
  );
  const none = await t.query(api.catalogue.list, {
    paginationOpts,
    searchQuery: "absent",
  });
  expect(none.page).toEqual([]);
  expect(none.isDone).toBe(true);
});

test("saved browsing requires identity and paginates only that user's current catalogue favourites", async () => {
  const t = createTestContext();
  await seedBrowseCatalogue(t);
  const paginationOpts = { numItems: 20, cursor: null };
  await expect(
    t.query(api.catalogue.list, { paginationOpts, savedOnly: true }),
  ).rejects.toThrow();
  await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      authSubject: "browser",
      email: "browser@example.com",
      name: "Browser",
      createdAt: 1,
      updatedAt: 1,
    });
    const anotherOwner = await ctx.db.insert("users", {
      authSubject: "other",
      email: "other@example.com",
      name: "Other",
      createdAt: 1,
      updatedAt: 1,
    });
    for (let i = 0; i < 45; i++) {
      await ctx.db.insert("recipes", {
        ownerId: i < 23 ? ownerId : anotherOwner,
        title: `Saved ${i}`,
        ingredients: [],
        steps: [],
        proteinCategory: "meat-free",
        source: {
          type: "catalogue",
          catalogueMealId: `meal-${i}`,
          catalogueVersion: 1,
        },
        savedAt: 1,
        updatedAt: 1,
      });
    }
  });
  const asUser = t.withIdentity({ subject: "browser" });
  const first = await asUser.query(api.catalogue.list, {
    paginationOpts,
    savedOnly: true,
  });
  expect(first.page).toHaveLength(20);
  const second = await asUser.query(api.catalogue.list, {
    paginationOpts: { numItems: 20, cursor: first.continueCursor },
    savedOnly: true,
  });
  expect(second.page.map((meal) => meal.position)).toEqual([2, 1, 0]);
  expect(second.isDone).toBe(true);
  const emptyUser = await t.run((ctx) =>
    ctx.db.insert("users", {
      authSubject: "empty",
      email: "empty@example.com",
      name: "Empty",
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  expect(emptyUser).toBeTruthy();
  const empty = await t
    .withIdentity({ subject: "empty" })
    .query(api.catalogue.list, { paginationOpts, savedOnly: true });
  expect(empty.page).toEqual([]);
});

test("browse-key backfill preserves existing recipes and puts unknown durations last", async () => {
  const t = createTestContext();
  await seedMeal(t, {
    version: 1,
    status: "published",
    mealId: "old",
    slug: "old",
  });
  await t.mutation(internal.catalogue.backfillBrowseKeys, {
    paginationOpts: { numItems: 100, cursor: null },
  });
  await t.mutation(internal.catalogue.backfillBrowseKeys, {
    paginationOpts: { numItems: 100, cursor: null },
  });
  const meals = await t.query(api.catalogue.list, {
    paginationOpts: { numItems: 20, cursor: null },
    sort: "quickest",
  });
  expect(meals.page[0].id).toBe("old");
  expect(catalogueBrowseKeys({})).toEqual({
    browseDuration: Number.MAX_SAFE_INTEGER,
    browseCostRank: 3,
  });
});

test("substring search advances bounded scan cursors without losing distant matches", async () => {
  const t = createTestContext();
  await seedBrowseCatalogue(t);
  let cursor: string | null = null;
  let found = false;
  let batches = 0;
  do {
    const result: FunctionReturnType<typeof api.catalogue.list> = await t.query(
      api.catalogue.list,
      {
        searchQuery: "Dinner 0",
        paginationOpts: { numItems: 20, cursor, maximumRowsRead: 10 },
      },
    );
    batches++;
    if (result.page.length) {
      expect(result.page.map((meal) => meal.position)).toEqual([0]);
      found = true;
    }
    if (result.isDone) break;
    expect(result.continueCursor).not.toBe(cursor);
    cursor = result.continueCursor;
    expect(batches).toBeLessThan(10);
  } while (true);
  expect(found).toBe(true);
  expect(batches).toBeGreaterThan(1);
});

test("stream end cursors keep loaded pages adjacent after catalogue insertions", async () => {
  const t = createTestContext();
  await seedBrowseCatalogue(t);
  const first = await t.query(api.catalogue.list, {
    paginationOpts: { numItems: 20, cursor: null },
  });
  const second = await t.query(api.catalogue.list, {
    paginationOpts: { numItems: 20, cursor: first.continueCursor },
  });
  await seedMeal(t, {
    version: 1,
    status: "published",
    mealId: "inserted",
    slug: "inserted",
    position: 43.5,
  });
  const refreshed = await t.query(api.catalogue.list, {
    paginationOpts: {
      numItems: 20,
      cursor: null,
      endCursor: first.continueCursor,
    },
  });
  expect(refreshed.page).toHaveLength(21);
  expect(refreshed.page.some((meal) => meal.id === "inserted")).toBe(true);
  expect(refreshed.continueCursor).toBe(first.continueCursor);
  const reloaded = await t.query(api.catalogue.list, {
    paginationOpts: { numItems: 20, cursor: refreshed.continueCursor },
  });
  expect(reloaded.page.map((meal) => meal.id)).toEqual(
    second.page.map((meal) => meal.id),
  );
});

test("catalogue storage and paginated protein filters distinguish turkey from other", async () => {
  const t = createTestContext();
  await seedMeal(t, {
    version: 1,
    status: "published",
    mealId: "turkey-dinner",
    slug: "turkey-dinner",
    position: 0,
  });
  await seedMeal(t, {
    version: 1,
    status: "published",
    mealId: "other-dinner",
    slug: "other-dinner",
    position: 1,
  });
  await t.run(async (ctx) => {
    for (const meal of await ctx.db.query("catalogueMeals").collect())
      await ctx.db.patch(meal._id, {
        proteinCategory:
          meal.catalogueMealId === "turkey-dinner" ? "turkey" : "other",
      });
  });
  const turkey = await t.query(api.catalogue.list, {
    paginationOpts: { numItems: 20, cursor: null },
    proteinCategories: ["turkey"],
  });
  expect(turkey.page.map((meal) => meal.id)).toEqual(["turkey-dinner"]);
  const other = await t.query(api.catalogue.list, {
    paginationOpts: { numItems: 20, cursor: null },
    proteinCategories: ["other"],
  });
  expect(other.page.map((meal) => meal.id)).toEqual(["other-dinner"]);
});

const discoveryArgs = {
  day: "2030-11-01",
  localPlannedMealIds: [] as string[],
};
async function seedDiscoveryCatalogue(t: ReturnType<typeof createTestContext>) {
  for (let index = 0; index < 10; index++) {
    await seedMeal(t, {
      version: 1,
      status: "published",
      mealId: `discovery-${index}`,
      slug: `discovery-${index}`,
      position: index,
    });
  }
}
async function discoveryUser(
  t: ReturnType<typeof createTestContext>,
  subject: string,
) {
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", {
      authSubject: subject,
      email: null,
      name: subject,
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  return { userId, asUser: t.withIdentity({ subject }) };
}

test("public discovery returns at most six published summaries, excluding local draft IDs", async () => {
  const t = createTestContext();
  await seedDiscoveryCatalogue(t);
  await seedMeal(t, {
    version: 1,
    status: "staging",
    mealId: "hidden",
    slug: "hidden",
    position: 20,
  });
  const args = {
    ...discoveryArgs,
    localPlannedMealIds: ["discovery-0", "discovery-1"],
  };
  const result = await t.query(api.catalogue.getDiscovery, args);
  expect(result).toHaveLength(6);
  for (const id of args.localPlannedMealIds) {
    expect(result.map((meal) => meal.id)).not.toContain(id);
  }
  expect(result.every((meal) => meal.id !== "hidden" && meal.imageSrc)).toBe(
    true,
  );
  expect(result[0]).not.toHaveProperty("ingredients");
  expect(await t.query(api.catalogue.getDiscovery, args)).toEqual(result);
  expect(
    await t.query(api.catalogue.getDiscovery, { ...args, day: "2030-11-02" }),
  ).not.toEqual(result);
  expect(
    await t.query(api.catalogue.getDiscovery, {
      ...args,
      localPlannedMealIds: Array.from(
        { length: 10 },
        (_, i) => `discovery-${i}`,
      ),
    }),
  ).toEqual([]);
});

test("discovery reads only the viewer's favourites, and authorises the selected household", async () => {
  const t = createTestContext();
  await seedDiscoveryCatalogue(t);
  const alice = await discoveryUser(t, "discovery-alice");
  const bob = await discoveryUser(t, "discovery-bob");
  const householdId = await t.run(async (ctx) => {
    const householdId = await ctx.db.insert("households", {
      creatorId: alice.userId,
      createdAt: 1,
    });
    await ctx.db.insert("householdMembers", {
      householdId,
      userId: alice.userId,
      joinedAt: 1,
    });
    await ctx.db.insert("householdMembers", {
      householdId,
      userId: bob.userId,
      joinedAt: 1,
    });
    return householdId;
  });
  await alice.asUser.mutation(api.recipes.saveCatalogueMeal, {
    catalogueMealId: "discovery-0",
    catalogueVersion: 1,
  });
  await bob.asUser.mutation(api.recipes.saveCatalogueMeal, {
    catalogueMealId: "discovery-1",
    catalogueVersion: 1,
  });
  // Leave exactly Bob's saved recipe eligible: his saves are not Alice's saves.
  const localPlannedMealIds = Array.from(
    { length: 8 },
    (_, i) => `discovery-${i + 2}`,
  );
  const result = await alice.asUser.query(api.catalogue.getDiscovery, {
    ...discoveryArgs,
    householdId,
    localPlannedMealIds,
  });
  expect(result.map((meal) => meal.id)).toEqual(["discovery-1"]);
  await expect(
    t.query(api.catalogue.getDiscovery, { ...discoveryArgs, householdId }),
  ).rejects.toThrow("Sign in");
  const outsider = await discoveryUser(t, "discovery-outsider");
  await expect(
    outsider.asUser.query(api.catalogue.getDiscovery, {
      ...discoveryArgs,
      householdId,
    }),
  ).rejects.toThrow("no longer have access");
});

test("the saved plan in the selected space takes precedence over local exclusions", async () => {
  const t = createTestContext();
  await seedDiscoveryCatalogue(t);
  const alice = await discoveryUser(t, "discovery-alice");
  await t.run(async (ctx) => {
    const recipeId = await ctx.db.insert("recipes", {
      ownerId: alice.userId,
      title: "Planned dinner",
      proteinCategory: "meat-free",
      ingredients: [{ id: "i", name: "rice", shoppingCategory: "pantry" }],
      steps: [{ id: "s", text: "Cook" }],
      source: {
        type: "catalogue",
        catalogueMealId: "discovery-0",
        catalogueVersion: 1,
      },
      updatedAt: 1,
    });
    const planId = await ctx.db.insert("mealPlans", {
      ownerId: alice.userId,
      startDate: discoveryArgs.day,
      endDate: discoveryArgs.day,
      status: "active",
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.insert("mealSlots", {
      ownerId: alice.userId,
      mealPlanId: planId,
      date: discoveryArgs.day,
      recipeId,
      status: "planned",
      createdAt: 1,
      updatedAt: 1,
    });
  });
  // Even excluding every catalogue ID locally must not override a saved week.
  const result = await alice.asUser.query(api.catalogue.getDiscovery, {
    ...discoveryArgs,
    localPlannedMealIds: Array.from({ length: 10 }, (_, i) => `discovery-${i}`),
  });
  expect(result).toHaveLength(6);
  expect(result.map((meal) => meal.id)).not.toContain("discovery-0");
});

test("discovery validates its client context without trusting an owner identifier", async () => {
  const t = createTestContext();
  await expect(
    t.query(api.catalogue.getDiscovery, {
      ...discoveryArgs,
      day: "2030-02-31",
    }),
  ).rejects.toThrow("calendar day");
  await expect(
    t.query(api.catalogue.getDiscovery, {
      ...discoveryArgs,
      localPlannedMealIds: Array(32).fill("meal"),
    }),
  ).rejects.toThrow("local plan exclusions");
});
