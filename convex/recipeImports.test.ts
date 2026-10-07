import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import schema from "./schema";
import { formatImportAmount } from "./lib/recipeImport/measurements";

const modules = import.meta.glob("./**/*.ts");

function createTestContext() {
  return convexTest(schema, modules);
}

async function seedUser(
  t: ReturnType<typeof createTestContext>,
  subject: string,
) {
  await t.run(async (ctx) => {
    await ctx.db.insert("users", {
      authSubject: subject,
      email: `${subject}@example.com`,
      name: subject,
      createdAt: 1,
      updatedAt: 1,
    });
  });
  return t.withIdentity({ subject });
}

const recipeCore = {
  title: "Fast tomato pasta",
  ingredients: [
    {
      id: "ingredient-1",
      name: "tomatoes",
      shoppingCategory: "fruit_and_veg" as const,
      quantity: "400",
      unit: "g",
    },
  ],
  steps: [{ id: "step-1", text: "Simmer the tomatoes." }],
  proteinCategory: "meat-free" as const,
};

test("persists normalized measurements through the existing recipe contract without changing older recipes", async () => {
  const t = createTestContext();
  const owner = await seedUser(t, "normalized-owner");
  const existingId = await owner.mutation(api.recipes.create, {
    recipe: recipeCore,
  });
  const before = await owner.query(api.recipes.getMine, {
    recipeId: existingId,
  });
  const importId = await owner.mutation(api.recipeImports.beginImport, {
    clientRequestId: "normalized",
    source: {
      type: "text",
      text: "Pepper stew\n1 large red pepper\n2 x 400 g cans tomatoes\nSimmer for 10 minutes.",
    },
  });
  await t.mutation(internal.recipeImports.claimAttempt, {
    importId,
    attempt: 1,
  });
  const recipeId = await t.mutation(internal.recipeImports.completeImport, {
    importId,
    attempt: 1,
    method: "text",
    normalizationVersion: 6,
    recipe: {
      ...recipeCore,
      title: "Pepper stew",
      servings: 4,
      prepMinutes: 5,
      cookMinutes: 10,
      servingScaling: "source_only",
      ingredients: [
        {
          id: "ingredient-1",
          name: "large red pepper",
          note: "finely diced",
          shoppingCategory: "fruit_and_veg",
          sourceText: "1 large red pepper, finely diced",
          ...formatImportAmount({
            kind: "exact",
            value: 1,
            unit: null,
            qualifier: null,
            equivalents: [],
          }),
        },
        {
          id: "ingredient-2",
          name: "tomatoes",
          shoppingCategory: "pantry",
          ...formatImportAmount({
            kind: "package",
            count: 2,
            unit: "can",
            size: { value: 400, unit: "g" },
            equivalents: [],
          }),
        },
      ],
      steps: [{ id: "step-1", text: "Simmer for 10 minutes." }],
    },
  });
  expect(recipeId).not.toBeNull();
  const persisted = await owner.query(api.recipes.getMine, {
    recipeId: recipeId!,
  });
  expect(persisted).toMatchObject({
    source: { normalizationVersion: 6 },
    servingScaling: "source_only",
    ingredients: [
      {
        name: "large red pepper",
        quantity: "1",
        amountText: "1",
        note: "finely diced",
      },
      { name: "tomatoes", amountText: "2 × 400 g cans" },
    ],
    steps: [{ text: "Simmer for 10 minutes." }],
  });
  expect(
    await owner.query(api.recipes.getMine, { recipeId: existingId }),
  ).toEqual(before);
});

test("starts imports idempotently and keeps jobs owner scoped", async () => {
  const t = createTestContext();
  const asOwner = await seedUser(t, "import-owner");
  const asOther = await seedUser(t, "import-other");
  const source = {
    type: "text" as const,
    text: "Pasta\nIngredients\nTomatoes\nMethod\nSimmer the tomatoes.",
  };

  const importId = await asOwner.mutation(api.recipeImports.beginImport, {
    clientRequestId: "same-request",
    source,
  });
  await expect(
    asOwner.mutation(api.recipeImports.beginImport, {
      clientRequestId: "same-request",
      source,
    }),
  ).resolves.toBe(importId);
  await expect(
    asOther.query(api.recipeImports.getImport, { importId }),
  ).resolves.toBeNull();

  const jobs = await t.run(async (ctx) =>
    ctx.db.query("recipeImports").collect(),
  );
  expect(jobs).toHaveLength(1);
});

test("atomically completes one recipe, derives review, and repairs it", async () => {
  const t = createTestContext();
  const asOwner = await seedUser(t, "completion-owner");
  const importId = await asOwner.mutation(api.recipeImports.beginImport, {
    clientRequestId: "completion-request",
    source: {
      type: "text",
      text: "Pasta\nIngredients\nTomatoes\nMethod\nSimmer the tomatoes.",
    },
  });

  await expect(
    t.mutation(internal.recipeImports.claimAttempt, { importId, attempt: 1 }),
  ).resolves.toBe(true);
  const recipeId = await t.mutation(internal.recipeImports.completeImport, {
    importId,
    attempt: 1,
    recipe: recipeCore,
    method: "text",
  });
  expect(recipeId).not.toBeNull();
  await expect(
    t.mutation(internal.recipeImports.completeImport, {
      importId,
      attempt: 1,
      recipe: recipeCore,
      method: "text",
    }),
  ).resolves.toBeNull();

  const job = await asOwner.query(api.recipeImports.getImport, { importId });
  expect(job).toMatchObject({
    status: "needs_review",
    reviewIssues: ["servings", "prep_minutes", "cook_minutes"],
    resultRecipeId: recipeId,
  });
  expect(
    await t.run(async (ctx) => (await ctx.db.get(importId))?.inputText),
  ).toBeNull();
  const recipes = await t.run(async (ctx) => ctx.db.query("recipes").collect());
  expect(recipes).toHaveLength(1);

  const repaired = await asOwner.mutation(api.recipes.repairImport, {
    recipeId: recipeId!,
    servings: 4,
    prepMinutes: 0,
    cookMinutes: 20,
  });
  expect(repaired?.reviewIssues).toEqual([]);
});

test("retries only failed attempts and ignores stale watchdogs", async () => {
  const t = createTestContext();
  const asOwner = await seedUser(t, "retry-owner");
  const importId = await asOwner.mutation(api.recipeImports.beginImport, {
    clientRequestId: "retry-request",
    source: { type: "url", url: "https://example.com/recipe" },
  });

  await t.mutation(internal.recipeImports.failImport, {
    importId,
    attempt: 1,
    failureCode: "unsafe_result",
    failureDetails: ["ingredients"],
    failureSourceIds: ["B1", "source content must not be stored"],
    failureReasons: ["measurement", "arbitrary text must not be stored"],
  });
  expect(
    await asOwner.query(api.recipeImports.getImport, { importId }),
  ).toMatchObject({
    status: "failed",
    failureCode: "unsafe_result",
    failureDetails: ["ingredients"],
    failureSourceIds: ["B1"],
    failureReasons: ["measurement"],
  });
  await expect(
    asOwner.mutation(api.recipeImports.retryImport, { importId }),
  ).resolves.toBe(2);
  await t.mutation(internal.recipeImports.markTimedOut, {
    importId,
    attempt: 1,
  });
  const retriedImport = await asOwner.query(api.recipeImports.getImport, {
    importId,
  });
  expect(retriedImport).toMatchObject({
    status: "queued",
    attempt: 2,
  });
  expect(retriedImport).not.toHaveProperty("failureDetails");
  expect(retriedImport).not.toHaveProperty("failureSourceIds");
  expect(retriedImport).not.toHaveProperty("failureReasons");

  await t.mutation(internal.recipeImports.markTimedOut, {
    importId,
    attempt: 2,
  });
  expect(
    await asOwner.query(api.recipeImports.getImport, { importId }),
  ).toMatchObject({ status: "failed", failureCode: "timed_out" });
});

test("records inferred metadata provenance and clears labels for owner corrections", async () => {
  const t = createTestContext();
  const asOwner = await seedUser(t, "provenance-owner");
  const importId = await asOwner.mutation(api.recipeImports.beginImport, {
    clientRequestId: "provenance-request",
    source: {
      type: "text",
      text: "Pasta\nIngredients\nTomatoes\nMethod\nSimmer the tomatoes.",
    },
  });
  await t.mutation(internal.recipeImports.claimAttempt, {
    importId,
    attempt: 1,
  });
  const recipeId = await t.mutation(internal.recipeImports.completeImport, {
    importId,
    attempt: 1,
    recipe: {
      ...recipeCore,
      servings: 4,
      prepMinutes: 15,
      cookMinutes: 20,
    },
    method: "text",
    metadataProvenance: {
      servings: "estimated",
      prepMinutes: "estimated",
      cookMinutes: "derived",
    },
  });

  const imported = await asOwner.query(api.recipes.getMine, {
    recipeId: recipeId!,
  });
  expect(imported?.source).toMatchObject({
    type: "import",
    metadataProvenance: {
      servings: "estimated",
      prepMinutes: "estimated",
      cookMinutes: "derived",
    },
  });

  const updated = await asOwner.mutation(api.recipes.updateImported, {
    recipeId: recipeId!,
    recipe: {
      ...recipeCore,
      servings: 4,
      prepMinutes: 10,
      cookMinutes: 20,
    },
  });
  expect(updated?.source).toMatchObject({
    type: "import",
    metadataProvenance: {
      servings: "estimated",
      cookMinutes: "derived",
    },
  });
  expect(
    updated?.source.type === "import"
      ? updated.source.metadataProvenance?.prepMinutes
      : undefined,
  ).toBeUndefined();
});

test("guards image attachment with the current import fingerprint", async () => {
  const t = createTestContext();
  await seedUser(t, "image-owner");
  const seeded = await t.run(async (ctx) => {
    const owner = await ctx.db
      .query("users")
      .withIndex("by_auth_subject", (q) => q.eq("authSubject", "image-owner"))
      .unique();
    const staleImage = await ctx.storage.store(new Blob(["stale"]));
    const freshImage = await ctx.storage.store(new Blob(["fresh"]));
    const recipeId = await ctx.db.insert("recipes", {
      ownerId: owner!._id,
      ...recipeCore,
      source: {
        type: "import",
        method: "url",
        importedAt: 1,
        contentFingerprint: "current-fingerprint",
      },
      savedAt: 1,
      updatedAt: 1,
    });
    return { recipeId, staleImage, freshImage };
  });

  await expect(
    t.mutation(internal.recipeImports.attachImage, {
      recipeId: seeded.recipeId,
      imageStorageId: seeded.staleImage,
      expectedContentFingerprint: "stale-fingerprint",
    }),
  ).resolves.toBe(false);
  expect(
    await t.run(
      async (ctx) => (await ctx.db.get(seeded.recipeId))?.imageStorageId,
    ),
  ).toBeNull();

  await expect(
    t.mutation(internal.recipeImports.attachImage, {
      recipeId: seeded.recipeId,
      imageStorageId: seeded.freshImage,
      expectedContentFingerprint: "current-fingerprint",
    }),
  ).resolves.toBe(true);
  expect(
    await t.run(
      async (ctx) => (await ctx.db.get(seeded.recipeId))?.imageStorageId,
    ),
  ).toBe(seeded.freshImage);
});

test("retains structural diagnostics without creating a vague owner review state", async () => {
  const t = createTestContext();
  const asOwner = await seedUser(t, "warning-owner");
  const importId = await asOwner.mutation(api.recipeImports.beginImport, {
    clientRequestId: "warning-request",
    source: {
      type: "text",
      text: "Meatballs\nIngredients\nBeef mince\nMethod\nBrown the meatballs.",
    },
  });
  await t.mutation(internal.recipeImports.claimAttempt, {
    importId,
    attempt: 1,
  });
  const recipe = {
    ...recipeCore,
    servings: 4,
    prepMinutes: 10,
    cookMinutes: 25,
    steps: [{ id: "stove-1", text: "Brown the meatballs." }],
  };
  const recipeId = await t.mutation(internal.recipeImports.completeImport, {
    importId,
    attempt: 1,
    recipe,
    method: "text",
    normalizationWarnings: [{ area: "method", code: "partial_coverage" }],
  });

  const imported = await asOwner.query(api.recipes.getMine, {
    recipeId: recipeId!,
  });
  expect(imported?.reviewIssues).toEqual([]);
  expect(imported?.source).toMatchObject({
    type: "import",
    normalizationWarnings: [{ area: "method", code: "partial_coverage" }],
  });
  const updated = await asOwner.mutation(api.recipes.updateImported, {
    recipeId: recipeId!,
    recipe,
  });
  expect(updated?.reviewIssues).toEqual([]);
  expect(
    updated?.source.type === "import"
      ? updated.source.normalizationWarnings
      : undefined,
  ).toBeUndefined();
});
