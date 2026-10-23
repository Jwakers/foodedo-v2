import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
const modules = import.meta.glob("./**/*.ts");

test("legacy flags remain retired and new writes preserve future IDs", async () => {
  const t = convexTest(schema, modules);
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", {
      authSubject: "alice",
      email: null,
      name: "Alice",
      createdAt: 1,
      updatedAt: 1,
      onboarding: { homeRetired: true, retired: ["future-feature"] },
    }),
  );
  const alice = t.withIdentity({ subject: "alice" });
  expect(
    await alice.query(api.onboarding.getState, { authSubject: "alice" }),
  ).toEqual({ retired: ["future-feature", "home"] });
  await alice.mutation(api.onboarding.retire, {
    authSubject: "alice",
    introductions: ["recipes", "recipes"],
  });
  expect(await t.run((ctx) => ctx.db.get(userId))).toMatchObject({
    onboarding: {
      homeRetired: true,
      retired: ["future-feature", "home", "recipes"],
    },
  });
});

test("queued dismissal cannot follow authentication into a different account", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    for (const authSubject of ["alice", "bob"])
      await ctx.db.insert("users", {
        authSubject,
        email: null,
        name: null,
        createdAt: 1,
        updatedAt: 1,
      });
  });
  const bob = t.withIdentity({ subject: "bob" });
  await expect(
    bob.mutation(api.onboarding.retire, {
      authSubject: "alice",
      introductions: ["recipes"],
    }),
  ).rejects.toThrow("account changed");
  expect(
    await bob.query(api.onboarding.getState, { authSubject: "alice" }),
  ).toBeNull();
  expect(
    await bob.query(api.onboarding.getState, { authSubject: "bob" }),
  ).toEqual({ retired: [] });
  await expect(
    t.mutation(api.onboarding.retire, {
      authSubject: "bob",
      introductions: ["home"],
    }),
  ).rejects.toThrow();
});
