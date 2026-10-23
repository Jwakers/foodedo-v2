import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import schema from "./schema";
import { formatImportAmount } from "./lib/recipeImport/measurements";
import { RECIPE_NORMALIZATION_VERSION } from "./lib/recipeImport/contracts";

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
  steps: [
    {
      id: "step-1",
      text: "Simmer the tomatoes for 10 minutes.",
      timerCues: [{ id: "simmer", label: "Simmer", durationSeconds: 600 }],
    },
  ],
  proteinCategory: "meat-free" as const,
};

test("app-wide notification reads are bounded, private and exclude retained source/drafts", async () => {
  const t = createTestContext();
  const owner = await seedUser(t, "notifications-owner");
  const other = await seedUser(t, "notifications-other");
  await t.run(async (ctx) => {
    const users = await ctx.db.query("users").collect();
    const ownerId = users.find(
      (user) => user.authSubject === "notifications-owner",
    )!._id;
    for (let index = 0; index < 25; index++)
      await ctx.db.insert("recipeImports", {
        ownerId,
        clientRequestId: `notification-${index}`,
        sourceType: "text",
        inputText: "Private source text",
        status: "queued",
        phase: "waiting",
        attempt: 1,
        createdAt: index,
        updatedAt: index,
      });
  });
  const jobs = await owner.query(api.recipeImports.notificationJobs, {});
  expect(jobs).toHaveLength(20);
  expect(jobs.map((job) => job.updatedAt)).toEqual(
    Array.from({ length: 20 }, (_, index) => 24 - index),
  );
  expect(Object.keys(jobs[0]).sort()).toEqual([
    "_id",
    "attempt",
    "status",
    "updatedAt",
  ]);
  expect(await other.query(api.recipeImports.notificationJobs, {})).toEqual([]);
  expect(await t.query(api.recipeImports.notificationJobs, {})).toEqual([]);
  expect(
    await t
      .withIdentity({ subject: "not-yet-synced" })
      .query(api.recipeImports.notificationJobs, {}),
  ).toEqual([]);
});

const missingMethodIssue = {
  area: "method" as const,
  code: "partial_coverage" as const,
  targetId: null,
  message: "Add the missing cooking instructions.",
  blocking: true,
};

async function stagedDraft(
  t: ReturnType<typeof createTestContext>,
  owner: Awaited<ReturnType<typeof seedUser>>,
  request = "draft",
) {
  const importId = await owner.mutation(api.recipeImports.beginImport, {
    clientRequestId: request,
    source: {
      type: "text",
      text: "Ingredients: 400 g tomatoes. The cooking instructions are missing.",
    },
  });
  await t.mutation(internal.recipeImports.claimAttempt, {
    importId,
    attempt: 1,
  });
  await t.mutation(internal.recipeImports.stageDraft, {
    importId,
    attempt: 1,
    recipe: { ...recipeCore, steps: [] },
    issues: [missingMethodIssue],
    metadataProvenance: {},
  });
  return importId;
}

test("incomplete imports remain owner-private drafts outside the recipe library", async () => {
  const t = createTestContext();
  const owner = await seedUser(t, "draft-owner");
  const other = await seedUser(t, "draft-other");
  const importId = await stagedDraft(t, owner);
  const job = await owner.query(api.recipeImports.getImport, { importId });
  expect(job).toMatchObject({
    status: "awaiting_input",
    draft: { recipe: { steps: [] }, revision: 1 },
  });
  expect(
    await other.query(api.recipeImports.getImport, { importId }),
  ).toBeNull();
  await expect(
    other.mutation(api.recipeImports.updateDraft, {
      importId,
      attempt: 1,
      revision: 1,
      recipe: recipeCore,
      resolvedIssueIndexes: [0],
    }),
  ).rejects.toThrow("Import not found");
  await t.run(async (ctx) => {
    expect(await ctx.db.query("recipes").collect()).toHaveLength(0);
    expect((await ctx.db.get(importId))?.inputText).toBeUndefined();
  });
});

test("draft editing and finalization are revision-guarded, atomic and idempotent", async () => {
  const t = createTestContext();
  const owner = await seedUser(t, "draft-finalizer");
  const importId = await stagedDraft(t, owner);
  await expect(
    owner.mutation(api.recipeImports.finalizeDraft, {
      importId,
      attempt: 1,
      revision: 1,
    }),
  ).rejects.toThrow("Resolve the highlighted");
  const revision = await owner.mutation(api.recipeImports.updateDraft, {
    importId,
    attempt: 1,
    revision: 1,
    recipe: recipeCore,
    resolvedIssueIndexes: [0],
  });
  await expect(
    owner.mutation(api.recipeImports.updateDraft, {
      importId,
      attempt: 1,
      revision: 1,
      recipe: recipeCore,
      resolvedIssueIndexes: [0],
    }),
  ).rejects.toThrow("This draft changed");
  const recipeId = await owner.mutation(api.recipeImports.finalizeDraft, {
    importId,
    attempt: 1,
    revision,
  });
  expect(
    await owner.mutation(api.recipeImports.finalizeDraft, {
      importId,
      attempt: 1,
      revision,
    }),
  ).toBe(recipeId);
  expect(
    await owner.query(api.recipeImports.getImport, { importId }),
  ).toMatchObject({ resultRecipeId: recipeId });
  expect(
    (await owner.query(api.recipeImports.getImport, { importId }))?.draft,
  ).toBeUndefined();
  const recipe = await owner.query(api.recipes.getMine, { recipeId });
  expect(recipe).toMatchObject({
    title: recipeCore.title,
    steps: recipeCore.steps,
    source: { normalizationVersion: RECIPE_NORMALIZATION_VERSION },
    servingScaling: "source_only",
  });
  const editedSteps = recipeCore.steps.map((step) => ({
    ...step,
    text: "Simmer for 12 minutes.",
    timerCues: [{ id: "simmer", label: "Simmer", durationSeconds: 720 }],
  }));
  await owner.mutation(api.recipes.updateImported, {
    recipeId,
    recipe: { ...recipeCore, steps: editedSteps },
  });
  expect((await owner.query(api.recipes.getMine, { recipeId }))?.steps).toEqual(
    editedSteps,
  );
  await t.run(async (ctx) => {
    expect(await ctx.db.query("recipes").collect()).toHaveLength(1);
  });
});

test("draft acknowledgement cannot save an empty method or bypass recipe bounds", async () => {
  const t = createTestContext();
  const owner = await seedUser(t, "draft-bounds");
  const importId = await stagedDraft(t, owner);
  const revision = await owner.mutation(api.recipeImports.updateDraft, {
    importId,
    attempt: 1,
    revision: 1,
    recipe: { ...recipeCore, steps: [] },
    resolvedIssueIndexes: [0],
  });
  await expect(
    owner.mutation(api.recipeImports.finalizeDraft, {
      importId,
      attempt: 1,
      revision,
    }),
  ).rejects.toThrow();
  await expect(
    owner.mutation(api.recipeImports.updateDraft, {
      importId,
      attempt: 1,
      revision,
      recipe: {
        ...recipeCore,
        ingredients: [recipeCore.ingredients[0], recipeCore.ingredients[0]],
      },
      resolvedIssueIndexes: [0],
    }),
  ).rejects.toThrow();
  await t.run(async (ctx) => {
    expect(await ctx.db.query("recipes").collect()).toHaveLength(0);
  });
});

test("appending source text resumes the same import and prevents stale actions", async () => {
  const t = createTestContext();
  const owner = await seedUser(t, "draft-resume");
  const importId = await stagedDraft(t, owner);
  expect(
    await owner.mutation(api.recipeImports.resumeDraft, {
      importId,
      attempt: 1,
      revision: 1,
      text: "Simmer the tomatoes for 10 minutes, then serve.",
    }),
  ).toBe(2);
  await t.mutation(internal.recipeImports.stageDraft, {
    importId,
    attempt: 1,
    recipe: recipeCore,
    issues: [],
    metadataProvenance: {},
  });
  await t.mutation(internal.recipeImports.markTimedOut, {
    importId,
    attempt: 1,
  });
  expect(
    await owner.query(api.recipeImports.getImport, { importId }),
  ).toMatchObject({ attempt: 2, status: "queued" });
  expect(
    (await owner.query(api.recipeImports.getImport, { importId }))?.draft,
  ).toMatchObject({ recipe: { steps: [] }, revision: 1 });
  await t.mutation(internal.recipeImports.claimAttempt, {
    importId,
    attempt: 2,
  });
  const payload = await t.query(internal.recipeImports.getPayload, {
    importId,
    attempt: 2,
  });
  expect(payload?.inputText).toContain("Simmer the tomatoes for 10 minutes");
  expect(payload?.recoveredDraft?.recipe).toMatchObject({ steps: [] });
});

test("draft expiry is fixed and cleanup remains effective after editing", async () => {
  const t = createTestContext();
  const owner = await seedUser(t, "draft-expiry");
  const importId = await stagedDraft(t, owner);
  await t.run(async (ctx) =>
    ctx.db.patch(importId, { expiresAt: 1, updatedAt: 500 }),
  );
  await expect(
    owner.mutation(api.recipeImports.finalizeDraft, {
      importId,
      attempt: 1,
      revision: 1,
    }),
  ).rejects.toThrow("This draft expired");
  await t.mutation(internal.recipeImports.cleanupImport, {
    importId,
    expectedUpdatedAt: 100,
  });
  expect(
    await owner.query(api.recipeImports.getImport, { importId }),
  ).toBeNull();
});

test.each(["ai_unavailable", "timed_out"] as const)(
  "resumed drafts survive %s and can be edited and retried",
  async (failureCode) => {
    const t = createTestContext();
    const owner = await seedUser(t, `retained-${failureCode}`);
    const other = await seedUser(t, `other-${failureCode}`);
    const importId = await stagedDraft(t, owner);
    const before = await owner.query(api.recipeImports.getImport, { importId });
    await owner.mutation(api.recipeImports.resumeDraft, {
      importId,
      attempt: 1,
      revision: 1,
      text: "Simmer the tomatoes for 10 minutes.",
    });
    await t.mutation(internal.recipeImports.claimAttempt, {
      importId,
      attempt: 2,
    });
    if (failureCode === "timed_out")
      await t.mutation(internal.recipeImports.markTimedOut, {
        importId,
        attempt: 2,
      });
    else
      await t.mutation(internal.recipeImports.failImport, {
        importId,
        attempt: 2,
        failureCode,
      });
    const failed = await owner.query(api.recipeImports.getImport, { importId });
    expect(failed).toMatchObject({
      status: "failed",
      failureCode,
      draft: before!.draft,
      expiresAt: before!.expiresAt,
    });
    expect(
      await other.query(api.recipeImports.getImport, { importId }),
    ).toBeNull();
    const revision = await owner.mutation(api.recipeImports.updateDraft, {
      importId,
      attempt: 2,
      revision: 1,
      recipe: { ...recipeCore, title: "Edited after outage" },
      resolvedIssueIndexes: [0],
    });
    await owner.mutation(api.recipeImports.retryImport, { importId });
    await t.mutation(internal.recipeImports.claimAttempt, {
      importId,
      attempt: 3,
    });
    const payload = await t.query(internal.recipeImports.getPayload, {
      importId,
      attempt: 3,
    });
    expect(payload?.recoveredDraft).toMatchObject({
      recipe: { title: "Edited after outage" },
      revision,
    });
    expect(payload?.inputText).toBe("Simmer the tomatoes for 10 minutes.");
    await t.mutation(internal.recipeImports.stageDraft, {
      importId,
      attempt: 2,
      recipe: recipeCore,
      issues: [],
      metadataProvenance: {},
    });
    expect(
      (await owner.query(api.recipeImports.getImport, { importId }))?.attempt,
    ).toBe(3);
    await t.mutation(internal.recipeImports.completeImport, {
      importId,
      attempt: 3,
      recipe: recipeCore,
      method: "text",
    });
    const completed = await owner.query(api.recipeImports.getImport, {
      importId,
    });
    expect(completed?.draft).toBeUndefined();
    expect(completed?.expiresAt).toBeUndefined();
    expect(
      (await t.run(async (ctx) => ctx.db.get(importId)))?.inputText,
    ).toBeUndefined();
  },
);

test("failed retained drafts can finalize once and still expire after edits", async () => {
  const t = createTestContext();
  const owner = await seedUser(t, "retained-finalize");
  const importId = await stagedDraft(t, owner);
  await owner.mutation(api.recipeImports.resumeDraft, {
    importId,
    attempt: 1,
    revision: 1,
    text: "Simmer the tomatoes for 10 minutes.",
  });
  await t.mutation(internal.recipeImports.failImport, {
    importId,
    attempt: 2,
    failureCode: "ai_unavailable",
  });
  const revision = await owner.mutation(api.recipeImports.updateDraft, {
    importId,
    attempt: 2,
    revision: 1,
    recipe: recipeCore,
    resolvedIssueIndexes: [0],
  });
  const recipeId = await owner.mutation(api.recipeImports.finalizeDraft, {
    importId,
    attempt: 2,
    revision,
  });
  expect(
    await owner.mutation(api.recipeImports.finalizeDraft, {
      importId,
      attempt: 2,
      revision,
    }),
  ).toBe(recipeId);
  expect(
    (await owner.query(api.recipeImports.getImport, { importId }))?.failureCode,
  ).toBeUndefined();
  const expiredId = await stagedDraft(t, owner, "expired-retained");
  await t.run(async (ctx) =>
    ctx.db.patch(expiredId, { expiresAt: 1, status: "failed", updatedAt: 100 }),
  );
  await t.mutation(internal.recipeImports.cleanupImport, {
    importId: expiredId,
    expectedUpdatedAt: 0,
  });
  expect(
    await owner.query(api.recipeImports.getImport, { importId: expiredId }),
  ).toBeNull();
});

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
