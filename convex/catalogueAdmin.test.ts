import { convexTest } from "convex-test";
import { beforeEach, afterEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";
import type { RecipeContent } from "../src/lib/domain/recipes";
import {
  recipeFingerprint,
  type EditorialTags,
} from "../src/lib/domain/catalogue-generation";
import { catalogueSchedule } from "./lib/catalogueGeneration/config";

// Exercise the future scheduling path without enabling it in application config.
vi.mock("./lib/catalogueGeneration/config", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("./lib/catalogueGeneration/config")>();
  return {
    ...actual,
    catalogueSchedule: { ...actual.catalogueSchedule, enabled: true },
  };
});
const modules = import.meta.glob("./**/*.ts");
const content: RecipeContent = {
  title: "Lemon chickpea rice",
  description: "A filling rice dish.",
  servings: 4,
  prepMinutes: 10,
  cookMinutes: 20,
  proteinCategory: "meat-free",
  costBand: "budget",
  ingredients: [
    {
      id: "chickpeas",
      name: "chickpeas",
      quantity: "400",
      unit: "g",
      shoppingCategory: "pantry",
    },
    {
      id: "rice",
      name: "rice",
      quantity: "250",
      unit: "g",
      shoppingCategory: "pantry",
    },
  ],
  steps: [
    { id: "one", text: "Cook the rice in simmering water for 15 minutes." },
    { id: "two", text: "Warm the chickpeas and fold into the rice." },
  ],
};
const tags: EditorialTags = {
  cuisines: ["mediterranean"],
  mealOccasion: "dinner",
  cookingMethods: ["simmered"],
  proteinSource: "chickpeas",
  carbBase: "rice",
  flavourProfile: ["lemon"],
  complexity: "simple",
  vegetarian: "yes",
  vegan: "yes",
};
function setup() {
  const t = convexTest(schema, modules);
  return { t, admin: t.withIdentity({ subject: "admin" }) };
}
async function seedProposal(
  t: ReturnType<typeof convexTest>,
  title = content.title,
) {
  const recipe = { ...content, title };
  const fingerprint = await recipeFingerprint(recipe);
  return t.run((ctx) =>
    ctx.db.insert("catalogueProposals", {
      content: recipe,
      tags,
      rationale: "Adds useful variety.",
      concept: "A complete chickpea rice main.",
      status: "pending_review",
      revision: 1,
      reviewedRevision: 1,
      findings: [],
      fingerprint,
      createdBy: "admin",
      createdAt: 1,
      updatedAt: 1,
    }),
  );
}
async function claimed(
  t: ReturnType<typeof convexTest>,
  runId: Parameters<
    typeof t.mutation<typeof internal.catalogueAdmin.claim>
  >[1]["runId"],
) {
  await t.mutation(internal.catalogueAdmin.claim, { runId });
  return (await t.run((ctx) => ctx.db.get(runId)))!;
}
beforeEach(() => {
  Object.assign(catalogueSchedule, { enabled: true });
  vi.useFakeTimers();
  vi.stubEnv("FOODEDO_ADMIN_CLERK_USER_IDS", "admin,second-admin");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

test("admin reads and writes reject guests and ordinary accounts", async () => {
  const { t } = setup();
  const proposalId = await seedProposal(t);
  for (const caller of [t, t.withIdentity({ subject: "ordinary" })]) {
    expect(await caller.query(api.catalogueAdmin.access, {})).toEqual({
      isAdmin: false,
    });
    await expect(caller.query(api.catalogueAdmin.overview, {})).rejects.toThrow(
      "Administrator",
    );
    await expect(
      caller.query(api.catalogueAdmin.analysisRows, {}),
    ).rejects.toThrow("Administrator");
    await expect(
      caller.query(api.catalogueAdmin.getProposal, { proposalId }),
    ).rejects.toThrow("Administrator");
    await expect(
      caller.mutation(api.catalogueAdmin.begin, {
        operation: "generate",
        requestKey: "request",
      }),
    ).rejects.toThrow("Administrator");
    await expect(
      caller.mutation(api.catalogueAdmin.updateProposal, {
        proposalId,
        revision: 1,
        content,
        tags,
      }),
    ).rejects.toThrow("Administrator");
    await expect(
      caller.mutation(api.catalogueAdmin.reject, {
        proposalId,
        revision: 1,
        reason: "No",
      }),
    ).rejects.toThrow("Administrator");
    await expect(
      caller.mutation(api.catalogueAdmin.deleteProposal, {
        proposalId,
        revision: 1,
      }),
    ).rejects.toThrow("Administrator");
    await expect(
      caller.mutation(api.catalogueAdmin.reviewMetadata, { rows: [] }),
    ).rejects.toThrow("Administrator");
    await expect(
      caller.mutation(api.catalogueAdmin.publish, { proposalId, revision: 1 }),
    ).rejects.toThrow("Administrator");
  }
});
test("manual and future scheduled requests share global lock and idempotency", async () => {
  const { t, admin } = setup();
  const ids = await Promise.all([
    admin.mutation(api.catalogueAdmin.begin, {
      operation: "generate",
      requestKey: "one",
    }),
    t
      .withIdentity({ subject: "second-admin" })
      .mutation(api.catalogueAdmin.begin, {
        operation: "generate",
        requestKey: "two",
      }),
  ]);
  expect(ids[0]).toBe(ids[1]);
  expect(
    await t.mutation(internal.catalogueAdmin.beginScheduled, {
      requestKey: "weekly:one",
    }),
  ).toBe(ids[0]);
  const run = await claimed(t, ids[0]);
  expect(
    await t.mutation(internal.catalogueAdmin.claim, { runId: run._id }),
  ).toBe(false);
  const proposalId = await t.mutation(internal.catalogueAdmin.completeRecipe, {
    runId: run._id,
    token: run.attemptToken,
    content,
    tags,
    concept: "Rice main",
    rationale: "Variety",
    findings: [],
  });
  expect(proposalId).not.toBeNull();
  expect(
    await t.mutation(internal.catalogueAdmin.completeRecipe, {
      runId: run._id,
      token: run.attemptToken,
      content,
      tags,
      concept: "Rice main",
      rationale: "Variety",
      findings: [],
    }),
  ).toBeNull();
  expect(
    await admin.mutation(api.catalogueAdmin.begin, {
      operation: "generate",
      requestKey: "one",
    }),
  ).toBe(run._id);
  expect(
    await t.run((ctx) => ctx.db.query("catalogueProposals").collect()),
  ).toHaveLength(1);
  expect(await t.query(api.catalogue.getCurrent, {})).toBeNull();
});
test("only two explicit approvals publish once, preserving current catalogue order", async () => {
  const { t, admin } = setup();
  const proposalId = await seedProposal(t);
  await expect(
    admin.mutation(api.catalogueAdmin.publish, { proposalId, revision: 1 }),
  ).rejects.toThrow("Approve");
  const runId = await admin.mutation(api.catalogueAdmin.begin, {
    operation: "image",
    requestKey: "image",
    proposalId,
    expectedRevision: 1,
  });
  const run = await claimed(t, runId);
  const imageStorageId = await t.run((ctx) =>
    ctx.storage.store(new Blob(["image"], { type: "image/png" })),
  );
  await t.mutation(internal.catalogueAdmin.completeImage, {
    runId,
    token: run.attemptToken,
    imageStorageId,
  });
  expect(await t.query(api.catalogue.getCurrent, {})).toBeNull();
  const publishedId = await admin.mutation(api.catalogueAdmin.publish, {
    proposalId,
    revision: 1,
  });
  expect(
    await admin.mutation(api.catalogueAdmin.publish, {
      proposalId,
      revision: 1,
    }),
  ).toBe(publishedId);
  expect(
    await t.run((ctx) => ctx.db.query("catalogueMeals").collect()),
  ).toHaveLength(1);
  expect((await t.query(api.catalogue.getCurrent, {}))?.meals[0].title).toBe(
    content.title,
  );
  await t.mutation(internal.catalogueAdmin.completeImage, {
    runId,
    token: run.attemptToken,
    imageStorageId,
  });
  expect(
    await t.run((ctx) => ctx.db.system.get(imageStorageId)),
  ).not.toBeNull();
});
test("editing invalidates culinary and image approvals; stale writes cannot overwrite edits", async () => {
  const { t, admin } = setup();
  const proposalId = await seedProposal(t);
  const revision = await admin.mutation(api.catalogueAdmin.updateProposal, {
    proposalId,
    revision: 1,
    content: { ...content, description: "An edited meal." },
    tags,
  });
  expect(revision).toBe(2);
  await expect(
    admin.mutation(api.catalogueAdmin.updateProposal, {
      proposalId,
      revision: 1,
      content,
      tags,
    }),
  ).rejects.toThrow("changed");
  await expect(
    admin.mutation(api.catalogueAdmin.begin, {
      operation: "image",
      requestKey: "image",
      proposalId,
      expectedRevision: 2,
    }),
  ).rejects.toThrow("culinary");
  const runId = await admin.mutation(api.catalogueAdmin.begin, {
    operation: "review",
    requestKey: "review",
    proposalId,
    expectedRevision: 2,
  });
  const run = await claimed(t, runId);
  await admin.mutation(api.catalogueAdmin.updateProposal, {
    proposalId,
    revision: 2,
    content: { ...content, title: "Changed again" },
    tags,
  });
  await t.mutation(internal.catalogueAdmin.completeReview, {
    runId,
    token: run.attemptToken,
    findings: [],
  });
  const p = await admin.query(api.catalogueAdmin.getProposal, { proposalId });
  expect(p?.reviewedRevision).toBeUndefined();
  expect(p?.revision).toBe(3);
  expect((await t.run((ctx) => ctx.db.get(runId)))?.status).toBe("failed");
});
test("blocking culinary findings prevent text approval", async () => {
  const { t, admin } = setup();
  const proposalId = await seedProposal(t);
  const runId = await admin.mutation(api.catalogueAdmin.begin, {
    operation: "review",
    requestKey: "review",
    proposalId,
    expectedRevision: 1,
  });
  const run = await claimed(t, runId);
  await t.mutation(internal.catalogueAdmin.completeReview, {
    runId,
    token: run.attemptToken,
    findings: [
      { area: "safety", message: "Unsafe cooking method", blocking: true },
    ],
  });
  await expect(
    admin.mutation(api.catalogueAdmin.begin, {
      operation: "image",
      requestKey: "image",
      proposalId,
      expectedRevision: 1,
    }),
  ).rejects.toThrow("culinary");
});
test("image failures and timeouts stay private; late images are removed", async () => {
  const { t, admin } = setup();
  const proposalId = await seedProposal(t);
  const runId = await admin.mutation(api.catalogueAdmin.begin, {
    operation: "image",
    requestKey: "image",
    proposalId,
    expectedRevision: 1,
  });
  const run = await claimed(t, runId);
  vi.setSystemTime(run.deadline + 1);
  await t.mutation(internal.catalogueAdmin.expireRun, { runId });
  const imageStorageId = await t.run((ctx) =>
    ctx.storage.store(new Blob(["late image"])),
  );
  await t.mutation(internal.catalogueAdmin.completeImage, {
    runId,
    token: run.attemptToken,
    imageStorageId,
  });
  expect(await t.run((ctx) => ctx.db.system.get(imageStorageId))).toBeNull();
  expect(
    (await admin.query(api.catalogueAdmin.getProposal, { proposalId }))?.status,
  ).toBe("pending_review");
  expect((await t.run((ctx) => ctx.db.get(runId)))?.status).toBe("timed_out");
  expect(await t.query(api.catalogue.getCurrent, {})).toBeNull();
});
test("failed regeneration retains original; successful replacement supersedes it", async () => {
  const { t, admin } = setup();
  const proposalId = await seedProposal(t);
  const first = await admin.mutation(api.catalogueAdmin.begin, {
    operation: "regenerate",
    requestKey: "regen1",
    proposalId,
    expectedRevision: 1,
  });
  const failed = await claimed(t, first);
  await t.mutation(internal.catalogueAdmin.failRun, {
    runId: first,
    token: failed.attemptToken,
    failure: "Unavailable",
  });
  expect(
    (await admin.query(api.catalogueAdmin.getProposal, { proposalId }))?.status,
  ).toBe("pending_review");
  const next = await admin.mutation(api.catalogueAdmin.begin, {
    operation: "regenerate",
    requestKey: "regen2",
    proposalId,
    expectedRevision: 1,
  });
  const run = await claimed(t, next);
  const replacement = await t.mutation(internal.catalogueAdmin.completeRecipe, {
    runId: next,
    token: run.attemptToken,
    content,
    tags,
    concept: "Same concept",
    rationale: "Improved method",
    findings: [],
  });
  expect(replacement).not.toBeNull();
  expect(
    (await admin.query(api.catalogueAdmin.getProposal, { proposalId }))?.status,
  ).toBe("superseded");
});
test("rejection/deletion cannot publish and deletion retains operational history", async () => {
  const { t, admin } = setup();
  const proposalId = await seedProposal(t);
  await admin.mutation(api.catalogueAdmin.reject, {
    proposalId,
    revision: 1,
    reason: "Too similar",
  });
  await expect(
    admin.mutation(api.catalogueAdmin.publish, { proposalId, revision: 2 }),
  ).rejects.toThrow("Approve");
  await admin.mutation(api.catalogueAdmin.deleteProposal, {
    proposalId,
    revision: 2,
  });
  expect(
    await admin.query(api.catalogueAdmin.getProposal, { proposalId }),
  ).toBeNull();
});
test("metadata stays uncounted until batch review and fingerprints reject stale content", async () => {
  const { t, admin } = setup();
  const fingerprint = await recipeFingerprint(content);
  await t.run(async (ctx) => {
    const imageStorageId = await ctx.storage.store(new Blob(["image"]));
    await ctx.db.insert("catalogueMeals", {
      ...content,
      catalogueMealId: "existing",
      version: 1,
      slug: "existing",
      position: 0,
      status: "published",
      imageStorageId,
      createdAt: 1,
      publishedAt: 1,
    });
  });
  const metadataId = await t.run((ctx) =>
    ctx.db.insert("catalogueAnalysisMetadata", {
      catalogueMealId: "existing",
      catalogueVersion: 1,
      fingerprint,
      tags,
      status: "proposed",
      createdAt: 1,
    }),
  );
  expect(
    (await admin.query(api.catalogueAdmin.overview, {})).statistics.classified,
  ).toBe(0);
  await expect(
    admin.mutation(api.catalogueAdmin.reviewMetadata, {
      rows: [{ metadataId, fingerprint: "stale", tags }],
    }),
  ).rejects.toThrow("changed");
  await admin.mutation(api.catalogueAdmin.reviewMetadata, {
    rows: [{ metadataId, fingerprint, tags }],
  });
  expect(
    (await admin.query(api.catalogueAdmin.overview, {})).statistics.cuisines,
  ).toEqual([{ value: "mediterranean", count: 1 }]);
});

test("specific recipe requests are trimmed, bounded and persisted through regeneration", async () => {
  const { t, admin } = setup();
  await expect(
    admin.mutation(api.catalogueAdmin.begin, {
      operation: "generate",
      requestKey: "long",
      initialPrompt: "x".repeat(2001),
    }),
  ).rejects.toThrow("2,000");
  await expect(
    admin.mutation(api.catalogueAdmin.begin, {
      operation: "enrich",
      requestKey: "wrong",
      initialPrompt: "Make a pie",
    }),
  ).rejects.toThrow("only supported");
  const runId = await admin.mutation(api.catalogueAdmin.begin, {
    operation: "generate",
    requestKey: "specific",
    initialPrompt: "  A rustic chickpea rice main  ",
  });
  const run = await claimed(t, runId);
  expect(run.initialPrompt).toBe("A rustic chickpea rice main");
  const proposalId = await t.mutation(internal.catalogueAdmin.completeRecipe, {
    runId,
    token: run.attemptToken,
    content,
    tags,
    concept: run.initialPrompt!,
    rationale: "Requested recipe",
    findings: [],
  });
  expect(
    (
      await admin.query(api.catalogueAdmin.getProposal, {
        proposalId: proposalId!,
      })
    )?.initialPrompt,
  ).toBe(run.initialPrompt);
  const next = await admin.mutation(api.catalogueAdmin.begin, {
    operation: "regenerate",
    requestKey: "specific-regen",
    proposalId: proposalId!,
    expectedRevision: 1,
  });
  const nextRun = await claimed(t, next);
  const replacementId = await t.mutation(
    internal.catalogueAdmin.completeRecipe,
    {
      runId: next,
      token: nextRun.attemptToken,
      content,
      tags,
      concept: "Same dish",
      rationale: "Improved",
      findings: [],
    },
  );
  expect(
    (
      await admin.query(api.catalogueAdmin.getProposal, {
        proposalId: replacementId!,
      })
    )?.initialPrompt,
  ).toBe(run.initialPrompt);
});

test.each([
  ["pending_review", 5],
  ["pending_review", 6],
  ["generating_image", 5],
  ["image_review", 5],
] as const)(
  "scheduled generation skips %s backlog of %i without scheduling work",
  async (status, count) => {
    const { t } = setup();
    for (let index = 0; index < count; index++) {
      const id = await seedProposal(t, `Awaiting approval ${index}`);
      await t.run((ctx) => ctx.db.patch(id, { status }));
    }
    expect(
      await t.mutation(internal.catalogueAdmin.beginScheduled, {
        requestKey: "scheduled:full",
      }),
    ).toBeNull();
    expect(
      await t.run((ctx) => ctx.db.query("catalogueGenerationRuns").collect()),
    ).toHaveLength(0);
    expect(
      await t.run((ctx) =>
        ctx.db.system.query("_scheduled_functions").collect(),
      ),
    ).toHaveLength(0);
  },
);

test("scheduled generation below five counts mixed review stages, excludes history, and shares the active lock", async () => {
  const { t } = setup();
  for (const status of [
    "pending_review",
    "pending_review",
    "generating_image",
    "image_review",
    "published",
    "rejected",
    "superseded",
  ] as const) {
    const id = await seedProposal(t, `${status} proposal`);
    await t.run((ctx) => ctx.db.patch(id, { status }));
  }
  const [first, second] = await Promise.all([
    t.mutation(internal.catalogueAdmin.beginScheduled, {
      requestKey: "scheduled:one",
    }),
    t.mutation(internal.catalogueAdmin.beginScheduled, {
      requestKey: "scheduled:two",
    }),
  ]);
  expect(first).not.toBeNull();
  expect(second).toBe(first);
  const runs = await t.run((ctx) =>
    ctx.db.query("catalogueGenerationRuns").collect(),
  );
  expect(runs).toHaveLength(1);
  expect(runs[0]).toMatchObject({
    trigger: "scheduled",
    operation: "generate",
    status: "queued",
    active: true,
  });
});

test("manual generation remains available when the scheduled backlog limit is reached", async () => {
  const { t, admin } = setup();
  for (let index = 0; index < 5; index++)
    await seedProposal(t, `Pending ${index}`);
  expect(
    await t.mutation(internal.catalogueAdmin.beginScheduled, {
      requestKey: "scheduled:full",
    }),
  ).toBeNull();
  const runId = await admin.mutation(api.catalogueAdmin.begin, {
    operation: "generate",
    requestKey: "manual:override",
  });
  expect(await t.run((ctx) => ctx.db.get(runId))).toMatchObject({
    trigger: "manual",
    status: "queued",
  });
});

test("scheduled generation resumes after review and existing request replays remain idempotent at the limit", async () => {
  const { t, admin } = setup();
  const proposalId = await seedProposal(t, "Recipe to reject");
  for (let index = 0; index < 4; index++)
    await seedProposal(t, `Pending ${index}`);
  const request = { requestKey: "scheduled:resume" };
  expect(
    await t.mutation(internal.catalogueAdmin.beginScheduled, request),
  ).toBeNull();
  await admin.mutation(api.catalogueAdmin.reject, {
    proposalId,
    revision: 1,
    reason: "Not suitable",
  });
  const runId = await t.mutation(
    internal.catalogueAdmin.beginScheduled,
    request,
  );
  expect(runId).not.toBeNull();
  await seedProposal(t, "Another pending recipe");
  expect(
    await t.mutation(internal.catalogueAdmin.beginScheduled, request),
  ).toBe(runId);
  expect(
    await t.mutation(internal.catalogueAdmin.beginScheduled, {
      requestKey: "scheduled:new",
    }),
  ).toBeNull();
  expect(
    await t.run((ctx) => ctx.db.query("catalogueGenerationRuns").collect()),
  ).toHaveLength(1);
  expect(
    await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect()),
  ).toHaveLength(2);
});

test("disabled scheduling exits without creating work, even when directly invoked", async () => {
  const { t } = setup();
  Object.assign(catalogueSchedule, { enabled: false });
  expect(
    await t.mutation(internal.catalogueAdmin.beginScheduled, {}),
  ).toBeNull();
  expect(
    await t.mutation(internal.catalogueAdmin.beginScheduled, {
      requestKey: "disabled",
    }),
  ).toBeNull();
  expect(
    await t.run((ctx) => ctx.db.query("catalogueGenerationRuns").collect()),
  ).toHaveLength(0);
  expect(
    await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect()),
  ).toHaveLength(0);
});

test("cron invocations deduplicate a 30-minute slot and allow the next slot", async () => {
  const { t } = setup();
  vi.setSystemTime(new Date("2026-10-21T09:00:00Z"));
  const runId = await t.mutation(internal.catalogueAdmin.beginScheduled, {});
  expect(runId).not.toBeNull();
  const run = await claimed(t, runId!);
  await t.mutation(internal.catalogueAdmin.failRun, {
    runId: run._id,
    token: run.attemptToken,
    failure: "Test provider failure",
  });
  vi.setSystemTime(new Date("2026-10-21T09:10:00Z"));
  expect(await t.mutation(internal.catalogueAdmin.beginScheduled, {})).toBe(
    runId,
  );
  expect(
    await t.run((ctx) => ctx.db.query("catalogueGenerationRuns").collect()),
  ).toHaveLength(1);
  vi.setSystemTime(new Date("2026-10-21T09:30:00Z"));
  const nextRunId = await t.mutation(
    internal.catalogueAdmin.beginScheduled,
    {},
  );
  expect(nextRunId).not.toBeNull();
  expect(nextRunId).not.toBe(runId);
  expect(
    await t.run((ctx) => ctx.db.query("catalogueGenerationRuns").collect()),
  ).toHaveLength(2);
});

test("a fifth scheduled recipe considers all four unapproved drafts and cannot save a duplicate of them", async () => {
  const { t } = setup();
  const titles = [
    "Lemon chickpea rice",
    "Smoky bean stew",
    "Mushroom barley bowl",
    "Paneer and spinach curry",
  ];
  const proposalIds: Id<"catalogueProposals">[] = [];
  for (const title of titles) proposalIds.push(await seedProposal(t, title));
  // Administrative approval and a current culinary classification are separate:
  // even an edited draft awaiting another culinary pass still occupies its gap.
  await t.run((ctx) =>
    ctx.db.patch(proposalIds[0], { reviewedRevision: undefined }),
  );
  const rejected = await seedProposal(t, "Rejected idea");
  await t.run((ctx) => ctx.db.patch(rejected, { status: "rejected" }));
  const runId = await t.mutation(internal.catalogueAdmin.beginScheduled, {
    requestKey: "fifth-recipe",
  });
  expect(runId).not.toBeNull();
  const payload = await t.query(internal.catalogueAdmin.payload, {
    runId: runId!,
  });
  expect(payload?.meals.map((meal) => meal.key).sort()).toEqual(
    [...proposalIds].sort(),
  );
  expect(payload?.meals.map((meal) => meal.content.title).sort()).toEqual(
    [...titles].sort(),
  );
  expect(
    payload?.meals.find((meal) => meal.key === proposalIds[0])?.tags,
  ).toBeUndefined();
  const statistics = (
    await t
      .withIdentity({ subject: "admin" })
      .query(api.catalogueAdmin.overview, {})
  ).statistics;
  expect(statistics.total).toBe(4);
  expect(statistics.classified).toBe(3);
  const run = await claimed(t, runId!);
  await expect(
    t.mutation(internal.catalogueAdmin.completeRecipe, {
      runId: run._id,
      token: run.attemptToken,
      content: { ...content, title: titles[3] },
      tags,
      concept: "A new meal",
      rationale: "An opportunity",
      findings: [],
    }),
  ).rejects.toThrow("blocking quality findings");
  expect(
    await t.run((ctx) =>
      ctx.db
        .query("catalogueProposals")
        .withIndex("by_status", (q) => q.eq("status", "pending_review"))
        .collect(),
    ),
  ).toHaveLength(4);
});
