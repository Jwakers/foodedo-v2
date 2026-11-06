import { convexTest } from "convex-test";
import { expect, it, vi, afterEach } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
const modules = import.meta.glob("./**/*.ts");
afterEach(() => vi.unstubAllEnvs());

it.each([
  ["youtube", "https://www.youtube.com/watch?v=l8DMvfFUVQM"],
  ["instagram", "https://www.instagram.com/reel/Cexample123/"],
  ["tiktok", "https://www.tiktok.com/@cook/video/7234567890123456789"],
] as const)(
  "keeps %s video-only demand on the import through retries, recovery and payload cleanup",
  async (platform, url) => {
    const t = convexTest(schema, modules);
    await t.run((ctx) =>
      ctx.db.insert("users", {
        authSubject: "owner",
        email: "owner@example.test",
        name: "Owner",
        createdAt: 1,
        updatedAt: 1,
      }),
    );
    const owner = t.withIdentity({ subject: "owner" });
    const importId = await owner.mutation(api.recipeImports.beginImport, {
      clientRequestId: "demand",
      source: { type: "url", url },
    });
    await t.mutation(internal.recipeImports.failImport, {
      importId,
      attempt: 1,
      failureCode: "video_only_unsupported",
    });
    await t.mutation(internal.recipeImports.failImport, {
      importId,
      attempt: 1,
      failureCode: "video_only_unsupported",
    });
    await owner.mutation(api.recipeImports.retryImport, { importId });
    await t.mutation(internal.recipeImports.failImport, {
      importId,
      attempt: 2,
      failureCode: "video_only_unsupported",
    });
    expect(await t.run((ctx) => ctx.db.get(importId))).toMatchObject({
      platform,
      failureCode: "video_only_unsupported",
      videoOnlyFirstDay: expect.any(String),
    });
    const source = {
      type: "text" as const,
      text: "Ingredients: 2 carrots. Method: Boil the carrots until tender.",
      resume: { importId, attempt: 2 },
    };
    expect(
      await owner.mutation(api.recipeImports.beginImport, {
        clientRequestId: "recover",
        source,
      }),
    ).toBe(importId);
    expect(
      await owner.mutation(api.recipeImports.beginImport, {
        clientRequestId: "recover",
        source,
      }),
    ).toBe(importId);
    expect(await t.run((ctx) => ctx.db.get(importId))).toMatchObject({
      attempt: 3,
      originalSourceUrl: url,
    });
    await t.mutation(internal.recipeImports.claimAttempt, {
      importId,
      attempt: 3,
    });
    const args = {
      importId,
      attempt: 3,
      method: "text" as const,
      recipe: {
        title: "Carrots",
        proteinCategory: "meat-free" as const,
        ingredients: [
          {
            id: "ingredient-1",
            name: "carrots",
            quantity: "2",
            shoppingCategory: "fruit_and_veg" as const,
          },
        ],
        steps: [{ id: "step-1", text: "Boil the carrots until tender." }],
      },
    };
    await t.mutation(internal.recipeImports.completeImport, args);
    await t.mutation(internal.recipeImports.completeImport, args);
    expect(await t.run((ctx) => ctx.db.get(importId))).toMatchObject({
      resultRecipeId: expect.any(String),
      videoOnlyFirstDay: expect.any(String),
    });
    const job = await t.run((ctx) => ctx.db.get(importId));
    await t.mutation(internal.recipeImports.cleanupImport, {
      importId,
      expectedUpdatedAt: job!.updatedAt - 1,
    });
    expect(
      (await t.run((ctx) => ctx.db.get(importId)))?.cleanedUpAt,
    ).toBeUndefined();
    await t.mutation(internal.recipeImports.cleanupImport, {
      importId,
      expectedUpdatedAt: job!.updatedAt,
    });
    expect(
      await owner.query(api.recipeImports.getImport, { importId }),
    ).toBeNull();
    expect(await owner.query(api.recipeImports.notificationJobs, {})).toEqual(
      [],
    );
    expect(await t.run((ctx) => ctx.db.get(importId))).toMatchObject({
      cleanedUpAt: expect.any(Number),
      videoOnlyFirstDay: expect.any(String),
    });
    const retained = await t.run((ctx) => ctx.db.get(importId));
    expect(retained?.originalSourceUrl).toBeUndefined();
    expect(retained?.inputText).toBeUndefined();
    await expect(
      owner.mutation(api.recipeImports.retryImport, { importId }),
    ).rejects.toThrow();
  },
);

it("does not classify blocked sources as video-only and keeps recovery protected", async () => {
  const t = convexTest(schema, modules);
  await t.run((ctx) =>
    ctx.db.insert("users", {
      authSubject: "owner",
      email: "owner@example.test",
      name: "Owner",
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  const owner = t.withIdentity({ subject: "owner" });
  const importId = await owner.mutation(api.recipeImports.beginImport, {
    clientRequestId: "blocked",
    source: { type: "url", url: "https://www.instagram.com/reel/Cexample123/" },
  });
  await t.mutation(internal.recipeImports.failImport, {
    importId,
    attempt: 1,
    failureCode: "source_blocked",
  });
  expect(
    (await t.run((ctx) => ctx.db.get(importId)))?.videoOnlyFirstDay,
  ).toBeUndefined();
  await expect(
    t.mutation(api.recipeImports.beginImport, {
      clientRequestId: "unauth",
      source: {
        type: "text",
        text: "Ingredients and a method that should remain private.",
        resume: { importId, attempt: 1 },
      },
    }),
  ).rejects.toThrow();
});

it("counts recovery through an edited draft and keeps resolved publisher attribution", async () => {
  const t = convexTest(schema, modules);
  await t.run((ctx) =>
    ctx.db.insert("users", {
      authSubject: "owner",
      email: "owner@example.test",
      name: "Owner",
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  const owner = t.withIdentity({ subject: "owner" });
  const importId = await owner.mutation(api.recipeImports.beginImport, {
    clientRequestId: "draft-recovery",
    source: { type: "url", url: "https://www.instagram.com/reel/Cexample123/" },
  });
  await t.mutation(internal.recipeImports.failImport, {
    importId,
    attempt: 1,
    failureCode: "video_only_unsupported",
  });
  await owner.mutation(api.recipeImports.beginImport, {
    clientRequestId: "draft-recovery-text",
    source: {
      type: "text",
      text: "Carrots: boil two carrots until tender.",
      resume: { importId, attempt: 1 },
    },
  });
  await t.mutation(internal.recipeImports.claimAttempt, {
    importId,
    attempt: 2,
  });
  await t.mutation(internal.recipeImports.recordAcquisition, {
    importId,
    attempt: 2,
    resolvedUrl: "https://example.com/recipe/carrots",
  });
  await t.mutation(internal.recipeImports.stageDraft, {
    importId,
    attempt: 2,
    recipe: {
      title: "Carrots",
      proteinCategory: "meat-free",
      ingredients: [
        {
          id: "ingredient-1",
          name: "carrots",
          quantity: "2",
          shoppingCategory: "fruit_and_veg",
        },
      ],
      steps: [{ id: "step-1", text: "Boil the carrots until tender." }],
    },
    issues: [],
    metadataProvenance: {},
    sourceName: "Example cook",
  });
  const recipeId = await owner.mutation(api.recipeImports.finalizeDraft, {
    importId,
    attempt: 2,
    revision: 1,
  });
  expect(
    await owner.mutation(api.recipeImports.finalizeDraft, {
      importId,
      attempt: 2,
      revision: 1,
    }),
  ).toBe(recipeId);
  expect((await t.run((ctx) => ctx.db.get(recipeId)))?.source).toMatchObject({
    sourceUrl: "https://example.com/recipe/carrots",
    sourceName: "Example cook",
  });
  expect(await t.run((ctx) => ctx.db.get(importId))).toMatchObject({
    videoOnlyFirstDay: expect.any(String),
    resultRecipeId: recipeId,
  });
  expect(
    await t.mutation(internal.recipeImports.recordAcquisition, {
      importId,
      attempt: 1,
      resolvedUrl: "https://wrong.example/",
    }),
  ).toBe(false);
});

it("rejects a native-capture account switch before creating or acknowledging a job", async () => {
  const t = convexTest(schema, modules);
  await t.run((ctx) =>
    ctx.db.insert("users", {
      authSubject: "current",
      email: "current@example.test",
      name: "Current",
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  await expect(
    t
      .withIdentity({ subject: "current" })
      .mutation(api.recipeImports.beginImport, {
        clientRequestId: "native-share:test",
        expectedAuthSubject: "previous",
        source: { type: "url", url: "https://example.com/recipe" },
      }),
  ).rejects.toThrow("account changed");
  expect(await t.run((ctx) => ctx.db.query("recipeImports").collect())).toEqual(
    [],
  );
});
