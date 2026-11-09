import { convexTest } from "../tests/convex-test";
import { afterEach, expect, test, vi } from "vitest";
afterEach(() => vi.useRealTimers());
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const clerkFields = {
  authSubject: "alice",
  email: "alice@example.com",
  name: "Alice from Clerk",
  createdAt: 10,
  updatedAt: 20,
};

test("provisioning requires authentication and accepts no client identity", async () => {
  const t = convexTest(schema, modules);
  await expect(t.mutation(api.users.ensureCurrent, {})).rejects.toThrow(
    "Sign in",
  );
  const alice = t.withIdentity({ subject: "alice" });
  await expect(
    // @ts-expect-error Runtime validation also rejects forged identities.
    alice.mutation(api.users.ensureCurrent, { authSubject: "bob" }),
  ).rejects.toThrow();
  expect(await t.run((ctx) => ctx.db.query("users").collect())).toEqual([]);
});

test("provisioning uses validated claims and preserves an existing account", async () => {
  const t = convexTest(schema, modules);
  const alice = t.withIdentity({
    subject: "alice",
    email: "alice@example.com",
    name: "Alice",
  });
  const before = Date.now();
  const id = await alice.mutation(api.users.ensureCurrent, {});
  const created = await t.run((ctx) => ctx.db.get(id));
  expect(created).toMatchObject({
    authSubject: "alice",
    email: "alice@example.com",
    name: "Alice",
  });
  expect(created!.createdAt).toBeGreaterThanOrEqual(before);
  expect(created!.updatedAt).toBe(created!.createdAt);
  await t.run((ctx) => ctx.db.patch(id, { onboarding: { retired: ["home"] } }));
  const existing = await t.run((ctx) => ctx.db.get(id));
  const changedClaims = t.withIdentity({
    subject: "alice",
    email: "other@example.com",
    name: "Other",
  });
  expect(await changedClaims.mutation(api.users.ensureCurrent, {})).toBe(id);
  expect(await t.run((ctx) => ctx.db.get(id))).toEqual(existing);
});

test("missing claims are nullable and accounts remain isolated", async () => {
  const t = convexTest(schema, modules);
  const alice = t.withIdentity({ subject: "alice" });
  const bob = t.withIdentity({ subject: "bob" });
  const aliceId = await alice.mutation(api.users.ensureCurrent, {});
  const bobId = await bob.mutation(api.users.ensureCurrent, {});
  expect(bobId).not.toBe(aliceId);
  expect(await alice.query(api.users.current, {})).toMatchObject({
    _id: aliceId,
    authSubject: "alice",
    email: null,
    name: null,
  });
  expect(await bob.query(api.users.current, {})).toMatchObject({
    _id: bobId,
    authSubject: "bob",
  });
});

test("concurrent recovery and webhook delivery share one user", async () => {
  const t = convexTest(schema, modules);
  const alice = t.withIdentity({ subject: "alice" });
  await Promise.all([
    alice.mutation(api.users.ensureCurrent, {}),
    alice.mutation(api.users.ensureCurrent, {}),
    t.mutation(internal.users.upsertFromClerk, clerkFields),
  ]);
  const users = await t.run((ctx) => ctx.db.query("users").collect());
  expect(users).toHaveLength(1);
  expect(users[0]).toMatchObject(clerkFields);
  expect(await alice.mutation(api.users.ensureCurrent, {})).toBe(users[0]._id);
});

test("webhooks enrich recovered users and recovery preserves webhook-first users", async () => {
  const t = convexTest(schema, modules);
  const alice = t.withIdentity({ subject: "alice" });
  const id = await alice.mutation(api.users.ensureCurrent, {});
  await t.run((ctx) => ctx.db.patch(id, { onboarding: { retired: ["home"] } }));
  await t.mutation(internal.users.upsertFromClerk, clerkFields);
  expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({
    ...clerkFields,
    onboarding: { retired: ["home"] },
  });
  const snapshot = await t.run((ctx) => ctx.db.get(id));
  expect(await alice.mutation(api.users.ensureCurrent, {})).toBe(id);
  expect(await t.run((ctx) => ctx.db.get(id))).toEqual(snapshot);

  await t.mutation(internal.users.upsertFromClerk, {
    ...clerkFields,
    authSubject: "bob",
  });
  const bob = t.withIdentity({ subject: "bob" });
  const bobBefore = await bob.query(api.users.current, {});
  expect(await bob.mutation(api.users.ensureCurrent, {})).toBe(bobBefore!._id);
  expect(await bob.query(api.users.current, {})).toEqual(bobBefore);
});

for (const provisionFirst of [true, false]) {
  test(`deletion blocks recovery and stale webhooks (provisioned: ${provisionFirst})`, async () => {
    const t = convexTest(schema, modules);
    const alice = t.withIdentity({
      subject: "alice",
      email: clerkFields.email,
    });
    if (provisionFirst) await alice.mutation(api.users.ensureCurrent, {});
    await t.mutation(internal.users.deleteFromClerk, { authSubject: "alice" });
    await t.mutation(internal.users.deleteFromClerk, { authSubject: "alice" });
    await expect(alice.mutation(api.users.ensureCurrent, {})).rejects.toThrow(
      "deleted",
    );
    await t.mutation(internal.users.upsertFromClerk, clerkFields);
    expect(await alice.query(api.users.current, {})).toBeNull();
    expect(await t.run((ctx) => ctx.db.query("users").collect())).toEqual([]);
    expect(
      await t.run((ctx) => ctx.db.query("deletedUserSubjects").collect()),
    ).toMatchObject([{ authSubject: "alice" }]);
    expect(
      await t.run((ctx) => ctx.db.query("deletedUserSubjects").collect()),
    ).toHaveLength(1);

    // A new Clerk identity may use the same email after re-registration.
    const replacement = t.withIdentity({
      subject: "replacement",
      email: clerkFields.email,
    });
    await replacement.mutation(api.users.ensureCurrent, {});
    expect(await replacement.query(api.users.current, {})).toMatchObject({
      authSubject: "replacement",
      email: clerkFields.email,
    });
  });
}

test("deletion wins a race with recovery and repeated webhook delivery", async () => {
  const t = convexTest(schema, modules);
  const alice = t.withIdentity({ subject: "alice" });
  await alice.mutation(api.users.ensureCurrent, {});
  const results = await Promise.allSettled([
    t.mutation(internal.users.deleteFromClerk, { authSubject: "alice" }),
    alice.mutation(api.users.ensureCurrent, {}),
    t.mutation(internal.users.upsertFromClerk, clerkFields),
    t.mutation(internal.users.deleteFromClerk, { authSubject: "alice" }),
  ]);
  expect(results[0].status).toBe("fulfilled");
  expect(results[2].status).toBe("fulfilled");
  expect(results[3].status).toBe("fulfilled");
  expect(await alice.query(api.users.current, {})).toBeNull();
  expect(
    await t.run((ctx) => ctx.db.query("deletedUserSubjects").collect()),
  ).toHaveLength(1);
  await expect(alice.mutation(api.users.ensureCurrent, {})).rejects.toThrow(
    "deleted",
  );
});

test("large deletion revokes access immediately, drains bounded batches and rejects late imports", async () => {
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  const alice = t.withIdentity({ subject: "large-account" });
  const ownerId = await alice.mutation(api.users.ensureCurrent, {});
  const bob = t.withIdentity({ subject: "retained-account" });
  const bobId = await bob.mutation(api.users.ensureCurrent, {});
  const imports = await t.run(async (ctx) => {
    const ids = [];
    for (let i = 0; i < 27; i++)
      ids.push(
        await ctx.db.insert("recipeImports", {
          ownerId,
          clientRequestId: `large-${i}`,
          sourceType: "text",
          inputText: "Private source",
          status: "processing",
          phase: "organising",
          attempt: 1,
          createdAt: 1,
          updatedAt: 1,
        }),
      );
    await ctx.db.insert("accountEntitlements", {
      ownerId,
      tier: "premium",
      validUntil: Date.now() + 1000,
    });
    return ids;
  });
  await t.mutation(internal.users.deleteFromClerk, {
    authSubject: "large-account",
  });
  expect(await alice.query(api.users.current, {})).toBeNull();
  await expect(alice.mutation(api.entitlements.current, {})).rejects.toThrow(
    "being prepared",
  );
  await expect(alice.mutation(api.users.ensureCurrent, {})).rejects.toThrow(
    "deleted",
  );
  const remaining = await t.run((ctx) =>
    ctx.db.query("recipeImports").collect(),
  );
  expect(remaining).toHaveLength(19);
  // This pending job has not been removed yet, but cannot complete or expose its source.
  expect(
    await t.query(internal.recipeImports.getPayload, {
      importId: imports[26],
      attempt: 1,
    }),
  ).toBeNull();
  expect(
    await t.mutation(internal.recipeImports.completeImport, {
      importId: imports[26],
      attempt: 1,
      method: "text",
      recipe: {
        title: "Late recipe",
        proteinCategory: "meat-free",
        ingredients: [
          { id: "one", name: "tomato", shoppingCategory: "fruit_and_veg" },
        ],
        steps: [{ id: "cook", text: "Cook the tomato." }],
      },
    }),
  ).toBeNull();
  await t.mutation(internal.users.deleteFromClerk, {
    authSubject: "large-account",
  });
  await t.mutation(internal.users.upsertFromClerk, {
    ...clerkFields,
    authSubject: "large-account",
  });
  for (let i = 0; i < 5; i++)
    await t.mutation(internal.users.cleanupDeletedUser, { ownerId });
  expect(await t.run((ctx) => ctx.db.query("recipeImports").collect())).toEqual(
    [],
  );
  expect(
    await t.run((ctx) => ctx.db.query("accountEntitlements").collect()),
  ).toEqual([]);
  expect(await t.run((ctx) => ctx.db.get(bobId))).not.toBeNull();
  await expect(
    t.mutation(internal.users.cleanupDeletedUser, { ownerId: bobId }),
  ).rejects.toThrow("live account");
});

test("image completion refuses a deleted owner while its recipe awaits cleanup", async () => {
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  const owner = t.withIdentity({ subject: "deleted-image-owner" });
  const ownerId = await owner.mutation(api.users.ensureCurrent, {});
  const { recipeId, imageStorageId } = await t.run(async (ctx) => {
    // The first cleanup batch is occupied, leaving the recipe in the database.
    for (let index = 0; index < 9; index++)
      await ctx.db.insert("recipeImports", {
        ownerId,
        clientRequestId: `image-job-${index}`,
        sourceType: "text",
        status: "failed",
        phase: "complete",
        attempt: 1,
        createdAt: 1,
        updatedAt: 1,
      });
    const recipeId = await ctx.db.insert("recipes", {
      ownerId,
      title: "Private tomato recipe",
      proteinCategory: "meat-free",
      ingredients: [
        { id: "tomato", name: "tomatoes", shoppingCategory: "fruit_and_veg" },
      ],
      steps: [{ id: "cook", text: "Cook the tomatoes." }],
      source: {
        type: "import",
        method: "text",
        importedAt: 1,
        contentFingerprint: "current",
      },
      savedAt: 1,
      updatedAt: 1,
    });
    return {
      recipeId,
      imageStorageId: await ctx.storage.store(new Blob(["image"])),
    };
  });
  await t.mutation(internal.users.deleteFromClerk, {
    authSubject: "deleted-image-owner",
  });
  expect(await t.run((ctx) => ctx.db.get(ownerId))).toBeNull();
  expect(await t.run((ctx) => ctx.db.get(recipeId))).not.toBeNull();
  await expect(
    t.mutation(internal.recipeImports.attachImage, {
      recipeId,
      imageStorageId,
      expectedContentFingerprint: "current",
    }),
  ).resolves.toBe(false);
  expect(
    await t.run(
      async (ctx) => (await ctx.db.get(recipeId))?.imageStorageId ?? null,
    ),
  ).toBeNull();
});
