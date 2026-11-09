import { afterEach, expect, test, vi } from "vitest";
import { convexTest } from "../tests/convex-test";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { tierPolicies } from "../src/lib/domain/entitlements";

const modules = import.meta.glob("./**/*.ts");
const recipe = {
  title: "Tomato pasta",
  proteinCategory: "meat-free" as const,
  ingredients: [
    {
      id: "tomato",
      name: "tomatoes",
      quantity: "400",
      unit: "g",
      shoppingCategory: "fruit_and_veg" as const,
    },
  ],
  steps: [{ id: "simmer", text: "Simmer the tomatoes for ten minutes." }],
};
function setup() {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-09T12:00:00Z"));
  return convexTest(schema, modules);
}
async function owner(t: ReturnType<typeof setup>, subject = "alice") {
  const client = t.withIdentity({ subject });
  const id = await client.mutation(api.users.ensureCurrent, {});
  return { client, id };
}
const begin = (
  client: Awaited<ReturnType<typeof owner>>["client"],
  id: string,
) =>
  client.mutation(api.recipeImports.beginImport, {
    clientRequestId: id,
    source: {
      type: "text",
      text: "Ingredients: 400 g tomatoes. Simmer for ten minutes.",
    },
  });
afterEach(() => vi.useRealTimers());

test("all accounts default to free; grants expire and clients cannot choose tiers", async () => {
  const t = setup();
  const { client, id } = await owner(t);
  await expect(t.mutation(api.entitlements.current, {})).rejects.toThrow(
    "Sign in",
  );
  expect(await client.mutation(api.entitlements.current, {})).toEqual({
    tier: "free",
    validUntil: null,
    ...tierPolicies.free,
  });
  await expect(
    client.mutation(
      api.entitlements.current,
      // @ts-expect-error Tier claims from the client must fail validation.
      { tier: "premium" },
    ),
  ).rejects.toThrow();
  const grant = await t.run((ctx) =>
    ctx.db.insert("accountEntitlements", {
      ownerId: id,
      tier: "premium",
      validUntil: Date.now() + 1000,
    }),
  );
  expect((await client.mutation(api.entitlements.current, {})).tier).toBe(
    "premium",
  );
  vi.setSystemTime(Date.now() + 1000);
  expect((await client.mutation(api.entitlements.current, {})).tier).toBe(
    "free",
  );
  await t.run((ctx) => ctx.db.delete(grant));
});

test("twenty attempts include retries, replays are free, quota is private and resets monthly", async () => {
  const t = setup();
  const { client } = await owner(t);
  const other = await owner(t, "bob");
  const importId = await begin(client, "original");
  for (let attempt = 1; attempt <= 20; attempt++) {
    expect(await begin(client, "original")).toBe(importId);
    await t.mutation(internal.recipeImports.markTimedOut, {
      importId,
      attempt,
    });
    if (attempt < 20)
      expect(
        await client.mutation(api.recipeImports.retryImport, { importId }),
      ).toBe(attempt + 1);
  }
  await expect(
    client.mutation(api.recipeImports.retryImport, { importId }),
  ).rejects.toThrow("20 import attempts");
  await expect(begin(client, "over-limit")).rejects.toThrow(
    "20 import attempts",
  );
  expect(
    await t.run((ctx) => ctx.db.query("recipeImports").collect()),
  ).toHaveLength(1);
  await expect(begin(other.client, "other-account")).resolves.toBeTruthy();
  vi.setSystemTime(new Date("2026-12-01T00:00:00Z"));
  expect(
    await client.mutation(api.recipeImports.retryImport, { importId }),
  ).toBe(21);
});

test("parallel starts reserve only two slots; rejected requests do not spend allowance", async () => {
  const t = setup();
  const { client } = await owner(t);
  const results = await Promise.allSettled([
    begin(client, "one"),
    begin(client, "two"),
    begin(client, "three"),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
  expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
  const jobs = await t.run((ctx) => ctx.db.query("recipeImports").collect());
  expect(jobs).toHaveLength(2);
  for (const job of jobs)
    await t.mutation(internal.recipeImports.markTimedOut, {
      importId: job._id,
      attempt: 1,
    });
  // Eighteen further attempts remain: the rejected third start rolled back.
  for (let i = 0; i < 18; i++) {
    const importId = await begin(client, `later-${i}`);
    await t.mutation(internal.recipeImports.markTimedOut, {
      importId,
      attempt: 1,
    });
  }
  await expect(begin(client, "exhausted")).rejects.toThrow(
    "20 import attempts",
  );
});

test("ten saved imports includes in-flight reservations, preserves existing content and frees removed slots", async () => {
  const t = setup();
  const { client, id } = await owner(t);
  const savedIds = await t.run(async (ctx) => {
    const ids = [];
    for (let i = 0; i < 9; i++)
      ids.push(
        await ctx.db.insert("recipes", {
          ...recipe,
          ownerId: id,
          savedAt: 1,
          updatedAt: 1,
          source: {
            type: "import",
            method: "text",
            importedAt: 1,
            normalizationVersion: 1,
            contentFingerprint: "fixture",
          },
        }),
      );
    return ids;
  });
  const importId = await begin(client, "tenth");
  await expect(begin(client, "eleventh-reservation")).rejects.toThrow(
    "10 imported recipes",
  );
  await t.mutation(internal.recipeImports.claimAttempt, {
    importId,
    attempt: 1,
  });
  await t.mutation(internal.recipeImports.completeImport, {
    importId,
    attempt: 1,
    recipe,
    method: "text",
  });
  await expect(begin(client, "eleventh")).rejects.toThrow(
    "10 imported recipes",
  );
  expect(
    await client.query(api.recipes.getMine, { recipeId: savedIds[0] }),
  ).toBeTruthy();
  await client.mutation(api.recipes.removeMineFromLibrary, {
    recipeId: savedIds[0],
  });
  await expect(begin(client, "new-slot")).resolves.toBeTruthy();
});

test("tier changes preserve already spent attempts instead of resetting monthly usage", async () => {
  const t = setup();
  const { client, id } = await owner(t);
  for (let i = 0; i < 19; i++) {
    const importId = await begin(client, `free-${i}`);
    await t.mutation(internal.recipeImports.markTimedOut, {
      importId,
      attempt: 1,
    });
  }
  const grant = await t.run((ctx) =>
    ctx.db.insert("accountEntitlements", {
      ownerId: id,
      tier: "premium",
      validUntil: Date.now() + 1000,
    }),
  );
  const importId = await begin(client, "premium-attempt");
  await t.mutation(internal.recipeImports.markTimedOut, {
    importId,
    attempt: 1,
  });
  await t.run((ctx) => ctx.db.delete(grant));
  await expect(begin(client, "free-again")).rejects.toThrow(
    "20 import attempts",
  );
});

test("draft finalization honours in-flight reservations and replays without another attempt", async () => {
  const t = setup();
  const { client, id } = await owner(t);
  const draftId = await begin(client, "draft");
  await t.mutation(internal.recipeImports.claimAttempt, {
    importId: draftId,
    attempt: 1,
  });
  await t.mutation(internal.recipeImports.stageDraft, {
    importId: draftId,
    attempt: 1,
    recipe,
    issues: [],
    metadataProvenance: {},
  });
  await t.run(async (ctx) => {
    for (let i = 0; i < 9; i++)
      await ctx.db.insert("recipes", {
        ...recipe,
        ownerId: id,
        savedAt: 1,
        updatedAt: 1,
        source: { type: "import", method: "text", importedAt: 1 },
      });
  });
  const queuedId = await begin(client, "reserved-slot");
  const args = { importId: draftId, attempt: 1, revision: 1 };
  await expect(
    client.mutation(api.recipeImports.finalizeDraft, args),
  ).rejects.toThrow("10 imported recipes");
  await t.mutation(internal.recipeImports.markTimedOut, {
    importId: queuedId,
    attempt: 1,
  });
  const recipeId = await client.mutation(api.recipeImports.finalizeDraft, args);
  expect(await client.mutation(api.recipeImports.finalizeDraft, args)).toBe(
    recipeId,
  );
});
