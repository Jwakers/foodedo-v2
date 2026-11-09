import { convexTest } from "../tests/convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import {
  getPlanningCandidates,
  selectPlanCandidateKeys,
} from "./lib/mealPlans/selection";
import {
  allergyMatches,
  ingredientAllergyEvidence,
  recipeAllergyEvidence,
  searchAllergies,
  isAllergyEligible,
} from "../src/lib/domain/allergies";

const modules = import.meta.glob("./**/*.ts");
const evidence = (name: string, note?: string) =>
  ingredientAllergyEvidence({ name, note });

test("search resolves aliases and distinguishes ambiguous nuts without inventing unsupported allergies", () => {
  expect(searchAllergies("dairy").map((a) => a.id)).toEqual(["milk"]);
  expect(searchAllergies("nuts").map((a) => a.id)).toEqual([
    "peanuts",
    "tree-nuts",
  ]);
  expect(searchAllergies("shellfish").map((a) => a.id)).toEqual([
    "crustaceans",
    "molluscs",
  ]);
  expect(searchAllergies("unknown brand sauce")).toEqual([]);
  expect(searchAllergies("lactose")).toEqual([]);
  expect(searchAllergies("coeliac")).toEqual([]);
});

test.each([
  "butter",
  "cheddar cheese",
  "whey protein",
  "lactose-free milk",
  "double cream",
])("milk derivatives are checked: %s", (name) => {
  expect(evidence(name).allergenIds).toContain("milk");
});
test.each([
  "coconut milk",
  "oat cream",
  "peanut butter",
  "cocoa butter",
  "dairy-free cheese",
  "vegan mayonnaise",
  "butter beans",
  "cream of tartar",
])("alternatives do not create false dairy matches: %s", (name) => {
  expect(evidence(name).allergenIds).not.toContain("milk");
});
test("whole tokens avoid eggplant, butternut and nutmeg while retaining alternative allergens", () => {
  expect(
    recipeAllergyEvidence({
      ingredients: [
        { name: "eggplant" },
        { name: "butternut squash" },
        { name: "nutmeg" },
      ],
    }).allergenIds,
  ).toEqual([]);
  expect(evidence("almond milk").allergenIds).toEqual(["tree-nuts"]);
  expect(evidence("peanut butter").allergenIds).toEqual(["peanuts"]);
  expect(evidence("vegan mayonnaise").allergenIds).not.toContain("eggs");
});
test("alternative labels never hide another named allergen, and missing evidence never passes planning", () => {
  expect(evidence("milk and vegan cheese").allergenIds).toContain("milk");
  expect(evidence("vegan mayo with egg").allergenIds).toContain("eggs");
  expect(isAllergyEligible({}, ["milk"])).toBe(false);
  expect(isAllergyEligible({}, [])).toBe(true);
});

test.each([
  ["milk, vegan cheese", "milk"],
  ["vegan sauce containing milk", "milk"],
  ["cream sauce (plant-based sausages)", "milk"],
  ["vegan cream, cheese", "milk"],
  ["vegan mayonnaise, egg", "eggs"],
  ["egg-free noodles containing egg", "eggs"],
  ["almond milk", "tree-nuts"],
  ["soy milk", "soya"],
])("alternative wording does not erase another allergen: %s", (name, id) => {
  expect(evidence(name).allergenIds).toContain(id);
  expect(isAllergyEligible(evidence(name), [id])).toBe(false);
});
test.each([
  "vegan cream cheese",
  "dairy-free double cream",
  "vegan milk chocolate",
])("explicit adjacent alternatives avoid dairy matches: %s", (name) => {
  expect(isAllergyEligible(evidence(name), ["milk"])).toBe(true);
});

test("compound ingredients, optional notes and wheat uncertainty are excluded without claiming definite presence", () => {
  expect(allergyMatches(evidence("pesto"), ["milk", "tree-nuts"])).toEqual({
    known: [],
    possible: ["milk", "tree-nuts"],
  });
  expect(isAllergyEligible(evidence("pesto"), ["milk"])).toBe(false);
  expect(evidence("flour").possibleAllergenIds).toContain("wheat");
  expect(
    evidence("potatoes", "butter to serve, optional").possibleAllergenIds,
  ).toContain("milk");
  expect(isAllergyEligible(evidence("potatoes"), ["milk"])).toBe(true);
});

async function setup() {
  const t = convexTest(schema, modules);
  const [a, b, c] = await t.run((ctx) =>
    Promise.all(
      ["alice", "bob", "outsider"].map((authSubject) =>
        ctx.db.insert("users", {
          authSubject,
          email: null,
          name: authSubject,
          createdAt: 1,
          updatedAt: 1,
        }),
      ),
    ),
  );
  const alice = t.withIdentity({ subject: "alice" });
  const bob = t.withIdentity({ subject: "bob" });
  const outsider = t.withIdentity({ subject: "outsider" });
  const householdId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("households", {
      creatorId: a!,
      createdAt: 1,
    });
    await ctx.db.insert("householdMembers", {
      householdId: id,
      userId: a!,
      joinedAt: 1,
    });
    await ctx.db.insert("householdMembers", {
      householdId: id,
      userId: b!,
      joinedAt: 1,
    });
    return id;
  });
  return { t, alice, bob, outsider, a: a!, b: b!, c: c!, householdId };
}

test("personal profiles require auth, reject arbitrary IDs and protect concurrent saves", async () => {
  const { t, alice, bob } = await setup();
  await expect(t.query(api.allergies.getCurrent, {})).rejects.toThrow();
  await expect(
    alice.mutation(api.allergies.save, {
      allergenIds: ["made-up"],
      shareWithHousehold: false,
      expectedRevision: 0,
    }),
  ).rejects.toThrow();
  await alice.mutation(api.allergies.save, {
    allergenIds: ["milk"],
    shareWithHousehold: false,
    expectedRevision: 0,
  });
  await expect(
    alice.mutation(api.allergies.save, {
      allergenIds: [],
      shareWithHousehold: false,
      expectedRevision: 0,
    }),
  ).rejects.toThrow(/changed elsewhere/);
  expect((await alice.query(api.allergies.getCurrent, {})).allergenIds).toEqual(
    ["milk"],
  );
  expect((await bob.query(api.allergies.getCurrent, {})).allergenIds).toEqual(
    [],
  );
});

test("household allergies aggregate only current members' shared profiles plus the actor's own", async () => {
  const { alice, bob, outsider, householdId, t, b } = await setup();
  await alice.mutation(api.allergies.save, {
    allergenIds: ["milk"],
    shareWithHousehold: false,
    expectedRevision: 0,
  });
  await bob.mutation(api.allergies.save, {
    allergenIds: ["peanuts"],
    shareWithHousehold: false,
    expectedRevision: 0,
  });
  expect(
    (await alice.query(api.allergies.getCurrent, { householdId })).effectiveIds,
  ).toEqual(["milk"]);
  await bob.mutation(api.allergies.save, {
    allergenIds: ["peanuts"],
    shareWithHousehold: true,
    expectedRevision: 1,
  });
  expect(
    (await alice.query(api.allergies.getCurrent, { householdId })).effectiveIds,
  ).toEqual(["milk", "peanuts"]);
  expect(
    (await alice.query(api.allergies.getCurrent, {})).effectiveIds,
  ).toEqual(["milk"]);
  await expect(
    outsider.query(api.allergies.getCurrent, { householdId }),
  ).rejects.toThrow();
  await bob.mutation(api.allergies.save, {
    allergenIds: ["peanuts"],
    shareWithHousehold: false,
    expectedRevision: 2,
  });
  expect(
    (await alice.query(api.allergies.getCurrent, { householdId })).effectiveIds,
  ).toEqual(["milk"]);
  await bob.mutation(api.allergies.save, {
    allergenIds: ["peanuts"],
    shareWithHousehold: true,
    expectedRevision: 3,
  });

  await t.run(async (ctx) => {
    const member = await ctx.db
      .query("householdMembers")
      .withIndex("by_user", (q) => q.eq("userId", b))
      .unique();
    await ctx.db.delete(member!._id);
  });
  expect(
    (await alice.query(api.allergies.getCurrent, { householdId })).effectiveIds,
  ).toEqual(["milk"]);
});

test("automatic suggestions exclude personal imports and catalogue matches; saving only adds read-time warnings", async () => {
  const { alice, t, a } = await setup();
  const recipeId = await alice.mutation(api.recipes.create, {
    recipe: {
      title: "Creamy potatoes",
      servings: 4,
      proteinCategory: "meat-free",
      ingredients: [
        { id: "i", name: "cream", shoppingCategory: "dairy_and_eggs" },
      ],
      steps: [{ id: "s", text: "Cook potatoes." }],
    },
  });
  const planId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("mealPlans", {
      ownerId: a,
      status: "active",
      startDate: "2026-11-01",
      endDate: "2026-11-03",
      servings: 4,
      createdAt: 10,
      updatedAt: 10,
    });
    await ctx.db.insert("mealSlots", {
      ownerId: a,
      mealPlanId: id,
      recipeId,
      date: "2026-11-01",
      status: "planned",
      createdAt: 10,
      updatedAt: 10,
    });
    const imageStorageId = await ctx.storage.store(
      new Blob(["image"], { type: "image/webp" }),
    );
    for (const [position, name] of ["milk", "pesto", "potatoes"].entries())
      await ctx.db.insert("catalogueMeals", {
        catalogueMealId: `meal-${position}`,
        version: 1,
        status: "published",
        slug: `meal-${position}`,
        title: name,
        position,
        imageStorageId,
        publishedAt: 1,
        createdAt: 1,
        ingredients: [{ id: "i", name, shoppingCategory: "pantry" }],
        steps: [{ id: "s", text: "Cook." }],
        proteinCategory: "meat-free",
      });
    return id;
  });
  const list = await alice.mutation(api.shoppingLists.ensureForCurrentPlan, {});
  expect(list.status).toBe("ready");
  await t.run(async (ctx) => {
    const item = await ctx.db.query("shoppingListItems").first();
    expect(item).not.toBeNull();
    await ctx.db.patch(item!._id, { checked: true });
  });
  const before = await t.run(async (ctx) => ({
    plan: await ctx.db.get(planId),
    slots: await ctx.db.query("mealSlots").collect(),
    shopping: await ctx.db.query("shoppingLists").collect(),
    items: await ctx.db.query("shoppingListItems").collect(),
  }));
  await alice.mutation(api.allergies.save, {
    allergenIds: ["milk"],
    shareWithHousehold: false,
    expectedRevision: 0,
  });
  const titles = await alice.run(async (ctx) =>
    [...(await getPlanningCandidates(ctx, a)).byKey.values()].map(
      (candidate) => candidate.title,
    ),
  );
  expect(titles).toEqual(["potatoes"]);
  const after = await t.run(async (ctx) => ({
    plan: await ctx.db.get(planId),
    slots: await ctx.db.query("mealSlots").collect(),
    shopping: await ctx.db.query("shoppingLists").collect(),
    items: await ctx.db.query("shoppingListItems").collect(),
  }));
  expect(after).toEqual(before);
  const view = await alice.query(api.mealPlans.getCurrent, {});
  expect(view?.mealSlots[0]?.allergenIds).toContain("milk");
  // A fully filtered pool must never fall back to a conflicting candidate.
  await alice.mutation(api.allergies.save, {
    allergenIds: ["milk", "garlic"],
    shareWithHousehold: false,
    expectedRevision: 1,
  });
  await t.run(async (ctx) => {
    const meal = await ctx.db
      .query("catalogueMeals")
      .withIndex("by_meal_id_and_version", (q) =>
        q.eq("catalogueMealId", "meal-2").eq("version", 1),
      )
      .unique();
    await ctx.db.patch(meal!._id, {
      ingredients: [{ id: "i", name: "garlic", shoppingCategory: "pantry" }],
    });
  });
  const emptySelection = await alice.run(async (ctx) => {
    const candidatePool = await getPlanningCandidates(ctx, a);
    return {
      count: candidatePool.byKey.size,
      keys: await selectPlanCandidateKeys({
        ctx,
        ownerId: a,
        candidatePool,
        excludedCandidateKeys: [],
        numberOfMeals: 3,
        variationKey: "allergy-test",
      }),
    };
  });
  expect(emptySelection).toEqual({ count: 0, keys: [] });
});
