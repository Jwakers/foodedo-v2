import { convexTest } from "convex-test";
import { beforeEach, afterEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";
import {
  prepareRecipeContent,
  type RecipeContent,
} from "../src/lib/domain/recipes";
import { recipeFingerprint } from "../src/lib/domain/catalogue-generation";
const modules = import.meta.glob("./**/*.ts");
const content: RecipeContent = {
  title: "Cauliflower cheese",
  description: "Cauliflower with cheese sauce.",
  servings: 4,
  prepMinutes: 10,
  cookMinutes: 25,
  proteinCategory: "meat-free",
  costBand: "budget",
  ingredients: [
    {
      id: "cauliflower",
      name: "cauliflower",
      quantity: "800",
      unit: "g",
      shoppingCategory: "fruit_and_veg",
    },
    {
      id: "milk",
      name: "milk",
      quantity: "400",
      unit: "ml",
      shoppingCategory: "dairy_and_eggs",
    },
    {
      id: "cheese",
      name: "cheddar",
      quantity: "150",
      unit: "g",
      shoppingCategory: "dairy_and_eggs",
    },
  ],
  steps: [
    { id: "one", text: "Steam the cauliflower for 10 minutes." },
    {
      id: "two",
      text: "Warm the milk, stir in the cheese and serve over the cauliflower.",
    },
  ],
};
async function setup(legacy = false) {
  const t = convexTest(schema, modules);
  const mealId = await t.run(async (ctx) => {
    const imageStorageId = await ctx.storage.store(
      new Blob(["original image"]),
    );
    return ctx.db.insert("catalogueMeals", {
      ...(legacy
        ? {
            ...content,
            prepMinutes: undefined,
            cookMinutes: undefined,
            ingredients: content.ingredients.map((line) => ({
              ...line,
              quantity: undefined,
            })),
          }
        : content),
      catalogueMealId: "cauliflower-cheese",
      version: 1,
      status: "published",
      slug: "cauliflower-cheese",
      position: 8,
      imageStorageId,
      createdAt: 1,
      publishedAt: 1,
    });
  });
  return { t, admin: t.withIdentity({ subject: "admin" }), mealId };
}
async function claim(
  t: ReturnType<typeof convexTest>,
  runId: Id<"catalogueGenerationRuns">,
) {
  const token = await t.mutation(internal.catalogueAdmin.claim, { runId });
  if (!token) throw new Error("Expected an active run");
  return token;
}
async function finishImage(
  t: ReturnType<typeof convexTest>,
  runId: Id<"catalogueGenerationRuns">,
) {
  const token = await claim(t, runId);
  const imageStorageId = await t.run((ctx) =>
    ctx.storage.store(new Blob(["new image"])),
  );
  await t.mutation(internal.catalogueAdmin.completeImage, {
    runId,
    token,
    imageStorageId,
  });
  return imageStorageId;
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("FOODEDO_ADMIN_CLERK_USER_IDS", "admin");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

test("every maintenance endpoint denies guests and non-administrators", async () => {
  const { t, mealId } = await setup();
  for (const caller of [t, t.withIdentity({ subject: "ordinary" })]) {
    await expect(
      caller.query(api.catalogueMaintenance.list, {}),
    ).rejects.toThrow("Administrator");
    await expect(
      caller.query(api.catalogueMaintenance.getMeal, { mealId }),
    ).rejects.toThrow("Administrator");
    await expect(
      caller.mutation(api.catalogueMaintenance.start, {
        mealId,
        mode: "recipe",
        requestKey: "denied",
      }),
    ).rejects.toThrow("Administrator");
  }
});

test("recipe improvement publishes one new revision without changing saved copies or historical images", async () => {
  const { t, admin, mealId } = await setup();
  await t.run((ctx) =>
    ctx.db.insert("users", {
      authSubject: "reader",
      name: "Reader",
      email: null,
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  const saved = await t
    .withIdentity({ subject: "reader" })
    .mutation(api.recipes.saveCatalogueMeal, {
      catalogueMealId: "cauliflower-cheese",
      catalogueVersion: 1,
    });
  expect(saved.status).toBe("saved");
  const original = (await t.run((ctx) => ctx.db.get(mealId)))!;
  const started = await admin.mutation(api.catalogueMaintenance.start, {
    mealId,
    mode: "recipe",
    requestKey: "roux",
    feedback: "Use a roux for a reliable sauce",
  });
  const token = await claim(t, started.runId!);
  const payload = await t.query(internal.catalogueAdmin.payload, {
    runId: started.runId!,
  });
  expect(payload?.meals).toHaveLength(0);
  expect(
    (await admin.query(api.catalogueAdmin.overview, {})).statistics.total,
  ).toBe(1);
  const revised = {
    ...content,
    description: "Cauliflower with a roux-based cheese sauce.",
  };
  const p = (await admin.query(api.catalogueAdmin.getProposal, {
    proposalId: started.proposalId,
  }))!;
  await t.mutation(internal.catalogueAdmin.completeRecipe, {
    runId: started.runId!,
    token,
    content: revised,
    tags: p.tags,
    concept: content.title,
    rationale: "The sauce needs a stable base.",
    findings: [],
    changeSummary: ["Added a roux."],
  });
  expect(
    (
      await t.query(api.catalogue.getCurrentMealBySlug, {
        slug: "cauliflower-cheese",
      })
    )?.description,
  ).toBe(content.description);
  const updated = (await admin.query(api.catalogueAdmin.getProposal, {
    proposalId: started.proposalId,
  }))!;
  expect(updated).toMatchObject({
    revision: 2,
    reviewedRevision: 2,
    changeSummary: ["Added a roux."],
  });
  const imageRun = await admin.mutation(api.catalogueAdmin.begin, {
    operation: "image",
    requestKey: "approved",
    proposalId: p._id,
    expectedRevision: 2,
  });
  const newImage = await finishImage(t, imageRun);
  const published = await admin.mutation(api.catalogueAdmin.publish, {
    proposalId: p._id,
    revision: 2,
  });
  expect(
    await admin.mutation(api.catalogueAdmin.publish, {
      proposalId: p._id,
      revision: 2,
    }),
  ).toBe(published);
  expect(await t.run((ctx) => ctx.db.get(published))).toMatchObject({
    catalogueMealId: "cauliflower-cheese",
    version: 2,
    slug: original.slug,
    position: original.position,
    imageStorageId: newImage,
  });
  expect(await t.run((ctx) => ctx.db.get(mealId))).toMatchObject({
    status: "retired",
    description: content.description,
    imageStorageId: original.imageStorageId,
  });
  expect(
    await t.run((ctx) => ctx.db.system.get(original.imageStorageId!)),
  ).not.toBeNull();
  const snapshots = await t.run((ctx) => ctx.db.query("recipes").collect());
  expect(snapshots).toHaveLength(1);
  expect(snapshots[0]).toMatchObject({
    description: content.description,
    source: { type: "catalogue", catalogueVersion: 1 },
    imageStorageId: original.imageStorageId,
  });
  expect(
    (
      await t.query(api.catalogue.getMeal, {
        catalogueMealId: "cauliflower-cheese",
        catalogueVersion: 1,
      })
    )?.description,
  ).toBe(content.description);
  expect((await t.query(api.catalogue.getCurrent, {}))?.meals).toHaveLength(1);
});

test("image-only maintenance supports legacy metadata and preserves exact text and original storage", async () => {
  const { t, admin, mealId } = await setup(true);
  const source = (await t.run((ctx) => ctx.db.get(mealId)))!;
  const started = await admin.mutation(api.catalogueMaintenance.start, {
    mealId,
    mode: "image",
    requestKey: "photo",
  });
  const before = (await admin.query(api.catalogueAdmin.getProposal, {
    proposalId: started.proposalId,
  }))!;
  expect(before.status).toBe("generating_image");
  expect(before.imageStorageId).toBeUndefined();
  await expect(
    admin.mutation(api.catalogueAdmin.publish, {
      proposalId: before._id,
      revision: 1,
    }),
  ).rejects.toThrow("Approve");
  await finishImage(t, started.runId!);
  const published = await admin.mutation(api.catalogueAdmin.publish, {
    proposalId: before._id,
    revision: 1,
  });
  const updated = (await t.run((ctx) => ctx.db.get(published)))!;
  expect(await recipeFingerprint(updated)).toBe(
    await recipeFingerprint(source),
  );
  expect(prepareRecipeContent(updated)).toEqual(prepareRecipeContent(source));
  expect(updated.version).toBe(2);
  expect(
    await t.run((ctx) => ctx.db.system.get(source.imageStorageId!)),
  ).not.toBeNull();
  const metadata = await t.run((ctx) =>
    ctx.db.query("catalogueAnalysisMetadata").collect(),
  );
  expect(metadata[0].status).toBe("proposed");
});

test("maintenance request replay and concurrent starts reuse one draft and run", async () => {
  const { t, admin, mealId } = await setup();
  const request = { mealId, mode: "recipe" as const, requestKey: "one" };
  const [first, second] = await Promise.all([
    admin.mutation(api.catalogueMaintenance.start, request),
    admin.mutation(api.catalogueMaintenance.start, {
      ...request,
      requestKey: "two",
    }),
  ]);
  expect(first.proposalId).toBe(second.proposalId);
  expect(
    (await admin.mutation(api.catalogueMaintenance.start, request)).proposalId,
  ).toBe(first.proposalId);
  expect(
    await t.run((ctx) => ctx.db.query("catalogueProposals").collect()),
  ).toHaveLength(1);
  expect(
    await t.run((ctx) => ctx.db.query("catalogueGenerationRuns").collect()),
  ).toHaveLength(1);
});

test("other active jobs prevent orphan maintenance drafts", async () => {
  const { t, admin, mealId } = await setup();
  await admin.mutation(api.catalogueAdmin.begin, {
    operation: "generate",
    requestKey: "other",
  });
  await expect(
    admin.mutation(api.catalogueMaintenance.start, {
      mealId,
      mode: "image",
      requestKey: "busy",
    }),
  ).rejects.toThrow("Another editorial task");
  expect(
    await t.run((ctx) => ctx.db.query("catalogueProposals").collect()),
  ).toHaveLength(0);
});

test("failed maintenance and draft deletion leave the current recipe and image intact", async () => {
  const { t, admin, mealId } = await setup();
  const source = (await t.run((ctx) => ctx.db.get(mealId)))!;
  const started = await admin.mutation(api.catalogueMaintenance.start, {
    mealId,
    mode: "image",
    requestKey: "fail",
  });
  const token = await claim(t, started.runId!);
  await t.mutation(internal.catalogueAdmin.failRun, {
    runId: started.runId!,
    token,
    failure: "Provider unavailable",
  });
  expect((await t.run((ctx) => ctx.db.get(mealId)))?.status).toBe("published");
  await admin.mutation(api.catalogueAdmin.deleteProposal, {
    proposalId: started.proposalId,
    revision: 1,
  });
  expect(
    await t.run((ctx) => ctx.db.system.get(source.imageStorageId!)),
  ).not.toBeNull();
});

test("changing cooking content in an image-only proposal invalidates inherited text approval", async () => {
  const { t, admin, mealId } = await setup();
  const started = await admin.mutation(api.catalogueMaintenance.start, {
    mealId,
    mode: "image",
    requestKey: "edit-photo",
  });
  await finishImage(t, started.runId!);
  const proposal = (await admin.query(api.catalogueAdmin.getProposal, {
    proposalId: started.proposalId,
  }))!;
  const revision = await admin.mutation(api.catalogueAdmin.updateProposal, {
    proposalId: proposal._id,
    revision: 1,
    content: { ...content, cookMinutes: 30 },
    tags: proposal.tags,
  });
  const updated = (await admin.query(api.catalogueAdmin.getProposal, {
    proposalId: proposal._id,
  }))!;
  expect(updated).toMatchObject({
    maintenanceMode: "recipe",
    status: "pending_review",
    revision: 2,
  });
  expect(updated.reviewedRevision).toBeUndefined();
  expect(updated.imageStorageId).toBeUndefined();
  await expect(
    admin.mutation(api.catalogueAdmin.begin, {
      operation: "image",
      proposalId: proposal._id,
      expectedRevision: revision,
      requestKey: "not-approved",
    }),
  ).rejects.toThrow("culinary");
});

test("a stale source cannot publish and a late image is discarded", async () => {
  const { t, admin, mealId } = await setup();
  const started = await admin.mutation(api.catalogueMaintenance.start, {
    mealId,
    mode: "image",
    requestKey: "stale",
  });
  const token = await claim(t, started.runId!);
  await t.run((ctx) => ctx.db.patch(mealId, { status: "retired" }));
  const imageStorageId = await t.run((ctx) =>
    ctx.storage.store(new Blob(["late"])),
  );
  await t.mutation(internal.catalogueAdmin.completeImage, {
    runId: started.runId!,
    token,
    imageStorageId,
  });
  expect(await t.run((ctx) => ctx.db.system.get(imageStorageId))).toBeNull();
  expect((await t.run((ctx) => ctx.db.get(started.runId!)))?.status).toBe(
    "failed",
  );
  await expect(
    admin.mutation(api.catalogueMaintenance.start, {
      mealId,
      mode: "recipe",
      requestKey: "stale-again",
    }),
  ).rejects.toThrow("changed");
});

test("new recipe generation compares both published text and its pending maintenance revision without double-counting meals", async () => {
  const { t, admin, mealId } = await setup();
  const started = await admin.mutation(api.catalogueMaintenance.start, {
    mealId,
    mode: "recipe",
    requestKey: "revision",
  });
  const token = await claim(t, started.runId!);
  await t.mutation(internal.catalogueAdmin.failRun, {
    runId: started.runId!,
    token,
    failure: "Test",
  });
  const runId = await admin.mutation(api.catalogueAdmin.begin, {
    operation: "generate",
    requestKey: "new-meal",
  });
  const payload = await t.query(internal.catalogueAdmin.payload, { runId });
  expect(payload?.meals).toHaveLength(2);
  expect(
    payload?.meals.filter((meal) => meal.isCatalogueRevision),
  ).toHaveLength(1);
  expect(
    (await admin.query(api.catalogueAdmin.overview, {})).statistics.total,
  ).toBe(1);
});

test("publication refuses a reviewed image if its source was replaced in the meantime", async () => {
  const { t, admin, mealId } = await setup();
  const started = await admin.mutation(api.catalogueMaintenance.start, {
    mealId,
    mode: "image",
    requestKey: "old-source",
  });
  await finishImage(t, started.runId!);
  await t.run(async (ctx) => {
    const old = (await ctx.db.get(mealId))!;
    await ctx.db.patch(mealId, { status: "retired" });
    await ctx.db.insert("catalogueMeals", {
      ...content,
      catalogueMealId: old.catalogueMealId,
      version: 2,
      slug: old.slug,
      position: old.position,
      status: "published",
      imageStorageId: old.imageStorageId,
      createdAt: 2,
      publishedAt: 2,
    });
  });
  await expect(
    admin.mutation(api.catalogueAdmin.publish, {
      proposalId: started.proposalId,
      revision: 1,
    }),
  ).rejects.toThrow("changed");
  expect(
    (
      await t.query(api.catalogue.getCurrentMealBySlug, {
        slug: "cauliflower-cheese",
      })
    )?.version,
  ).toBe(2);
});
