// @vitest-environment node
import { convexTest } from "convex-test";
import { beforeEach, afterEach, expect, test, vi } from "vitest";
import sharp from "sharp";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { recipeFingerprint } from "../src/lib/domain/catalogue-generation";
import type { RecipeContent } from "../src/lib/domain/recipes";
const provider = vi.hoisted(() => ({ text: vi.fn(), image: vi.fn() }));
vi.mock("./lib/catalogueGeneration/models", async (original) => ({
  ...(await original<typeof import("./lib/catalogueGeneration/models")>()),
  gatewayGenerationClient: () => provider,
}));
const modules = import.meta.glob("./**/*.ts");
const content: RecipeContent = {
  title: "Lentil rice",
  servings: 4,
  prepMinutes: 10,
  cookMinutes: 20,
  proteinCategory: "meat-free",
  ingredients: [
    {
      id: "lentils",
      name: "lentils",
      quantity: "400",
      unit: "g",
      shoppingCategory: "pantry",
    },
  ],
  steps: [
    { id: "one", text: "Cook the rice for 15 minutes." },
    { id: "two", text: "Warm the lentils and serve." },
  ],
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("FOODEDO_ADMIN_CLERK_USER_IDS", "admin");
  provider.text.mockReset();
  provider.image.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
async function imageRun() {
  const t = convexTest(schema, modules);
  const admin = t.withIdentity({ subject: "admin" });
  const fingerprint = await recipeFingerprint(content);
  const proposalId = await t.run((ctx) =>
    ctx.db.insert("catalogueProposals", {
      content,
      tags: {
        cuisines: [],
        mealOccasion: "dinner",
        cookingMethods: [],
        proteinSource: "lentils",
        carbBase: "rice",
        flavourProfile: [],
        complexity: "simple",
        vegetarian: "yes",
        vegan: "yes",
      },
      rationale: "Variety",
      concept: "Lentil rice",
      revision: 1,
      reviewedRevision: 1,
      status: "pending_review",
      fingerprint,
      findings: [],
      createdAt: 1,
      updatedAt: 1,
      createdBy: "admin",
    }),
  );
  const runId = await admin.mutation(api.catalogueAdmin.begin, {
    operation: "image",
    requestKey: "image",
    proposalId,
    expectedRevision: 1,
  });
  return { t, admin, proposalId, runId };
}
test("injected image provider stores a validated image privately, without publishing", async () => {
  const { t, admin, proposalId, runId } = await imageRun();
  const bytes = await sharp({
    create: { width: 1200, height: 675, channels: 3, background: "#ece6da" },
  })
    .png()
    .toBuffer();
  provider.image.mockResolvedValue({
    bytes: new Uint8Array(bytes),
    mediaType: "image/png",
  });
  await t.action(internal.catalogueGenerationActions.process, { runId });
  const proposal = await admin.query(api.catalogueAdmin.getProposal, {
    proposalId,
  });
  expect(proposal?.status).toBe("image_review");
  expect(proposal?.imageStorageId).toBeDefined();
  expect(await t.query(api.catalogue.getCurrent, {})).toBeNull();
  expect(provider.image).toHaveBeenCalledOnce();
  expect(provider.text).not.toHaveBeenCalled();
});
test("invalid provider image fails privately and can be explicitly retried", async () => {
  const { t, admin, proposalId, runId } = await imageRun();
  provider.image.mockResolvedValue({
    bytes: new Uint8Array([1, 2, 3]),
    mediaType: "image/png",
  });
  await t.action(internal.catalogueGenerationActions.process, { runId });
  expect(
    (await admin.query(api.catalogueAdmin.getProposal, { proposalId }))?.status,
  ).toBe("pending_review");
  const run = await t.run((ctx) => ctx.db.get(runId));
  expect(run?.status).toBe("failed");
  expect(run?.failure).toContain("image failed");
  expect(provider.image).toHaveBeenCalledOnce();
  expect(await t.query(api.catalogue.getCurrent, {})).toBeNull();
});

test("catalogue image replacement uses the same image client without a text call or early publication", async () => {
  const t = convexTest(schema, modules);
  const admin = t.withIdentity({ subject: "admin" });
  const mealId = await t.run(async (ctx) =>
    ctx.db.insert("catalogueMeals", {
      ...content,
      catalogueMealId: "legacy-rice",
      version: 1,
      status: "published",
      slug: "legacy-rice",
      position: 0,
      imageStorageId: await ctx.storage.store(new Blob(["old image"])),
      createdAt: 1,
      publishedAt: 1,
    }),
  );
  const started = await admin.mutation(api.catalogueMaintenance.start, {
    mealId,
    mode: "image",
    requestKey: "catalogue-photo",
  });
  const bytes = await sharp({
    create: { width: 1200, height: 675, channels: 3, background: "#ece6da" },
  })
    .png()
    .toBuffer();
  provider.image.mockResolvedValue({
    bytes: new Uint8Array(bytes),
    mediaType: "image/png",
  });
  await t.action(internal.catalogueGenerationActions.process, {
    runId: started.runId!,
  });
  expect(provider.image).toHaveBeenCalledOnce();
  expect(provider.text).not.toHaveBeenCalled();
  expect(
    (
      await admin.query(api.catalogueAdmin.getProposal, {
        proposalId: started.proposalId,
      })
    )?.status,
  ).toBe("image_review");
  expect(
    (await t.query(api.catalogue.getCurrentMealBySlug, { slug: "legacy-rice" }))
      ?.version,
  ).toBe(1);
});

test("catalogue improvement action passes the request through review and authoring and saves only a private revision draft", async () => {
  const t = convexTest(schema, modules);
  const admin = t.withIdentity({ subject: "admin" });
  const mealId = await t.run(async (ctx) =>
    ctx.db.insert("catalogueMeals", {
      ...content,
      catalogueMealId: "rice",
      version: 1,
      status: "published",
      slug: "rice",
      position: 0,
      imageStorageId: await ctx.storage.store(new Blob(["old image"])),
      createdAt: 1,
      publishedAt: 1,
    }),
  );
  const started = await admin.mutation(api.catalogueMaintenance.start, {
    mealId,
    mode: "recipe",
    requestKey: "improve",
    feedback: "Make the sauce more reliable",
  });
  const tags = (await admin.query(api.catalogueAdmin.getProposal, {
    proposalId: started.proposalId,
  }))!.tags;
  provider.text
    .mockResolvedValueOnce({ findings: [] })
    .mockResolvedValueOnce({
      recipe: {
        ...content,
        description: "An improved rice dish.",
        costBand: "budget",
        preheat: null,
        notes: [],
        ingredients: [
          ...content.ingredients,
          {
            id: "rice",
            name: "rice",
            quantity: "250",
            unit: "g",
            shoppingCategory: "pantry",
          },
        ].map((line) => ({
          ...line,
          note: null,
          unit: line.unit ?? null,
          group: null,
          noteRefs: [],
        })),
        steps: content.steps.map((step) => ({
          ...step,
          group: null,
          noteRefs: [],
          timerCues: [],
        })),
      },
      tags,
      changeSummary: ["Improved the sauce method."],
    })
    .mockResolvedValueOnce({ findings: [] });
  await t.action(internal.catalogueGenerationActions.process, {
    runId: started.runId!,
  });
  expect(provider.text.mock.calls.map((call) => call[0])).toEqual([
    "culinary_review",
    "authoring",
    "culinary_review",
  ]);
  expect(provider.text.mock.calls[1][3]).toMatchObject({
    administratorRequest: "Make the sauce more reliable",
  });
  expect(provider.image).not.toHaveBeenCalled();
  const proposal = await admin.query(api.catalogueAdmin.getProposal, {
    proposalId: started.proposalId,
  });
  expect(proposal).toMatchObject({
    revision: 2,
    reviewedRevision: 2,
    status: "pending_review",
    changeSummary: ["Improved the sauce method."],
  });
  expect(
    (await t.query(api.catalogue.getCurrentMealBySlug, { slug: "rice" }))
      ?.description,
  ).toBeUndefined();
});

async function recoverableImprovement() {
  const t = convexTest(schema, modules);
  const admin = t.withIdentity({ subject: "admin" });
  const mealId = await t.run(async (ctx) =>
    ctx.db.insert("catalogueMeals", {
      ...content,
      catalogueMealId: "recoverable-rice",
      version: 1,
      status: "published",
      slug: "recoverable-rice",
      position: 0,
      imageStorageId: await ctx.storage.store(new Blob(["old image"])),
      createdAt: 1,
      publishedAt: 1,
    }),
  );
  const started = await admin.mutation(api.catalogueMaintenance.start, {
    mealId,
    mode: "recipe",
    requestKey: "recovery",
    feedback: "Improve the sauce",
  });
  const tags = (await admin.query(api.catalogueAdmin.getProposal, {
    proposalId: started.proposalId,
  }))!.tags;
  const revised = {
    recipe: {
      ...content,
      description: "Improved rice.",
      costBand: "budget",
      preheat: null,
      notes: [],
      ingredients: [
        ...content.ingredients,
        {
          id: "rice",
          name: "rice",
          quantity: "250",
          unit: "g",
          shoppingCategory: "pantry",
        },
      ].map((line) => ({
        ...line,
        note: null,
        unit: line.unit ?? null,
        group: null,
        noteRefs: [],
      })),
      steps: content.steps.map((step) => ({
        ...step,
        group: null,
        noteRefs: [],
        timerCues: [],
      })),
    },
    tags,
    changeSummary: ["Improved the sauce method."],
  };
  return { t, admin, mealId, ...started, revised };
}

test("a writing timeout retains the completed original critique privately", async () => {
  const { t, admin, proposalId, runId } = await recoverableImprovement();
  const finding = {
    area: "method",
    message: "The sauce needs a reliable thickening step.",
    blocking: true,
  };
  provider.text
    .mockResolvedValueOnce({ findings: [finding] })
    .mockRejectedValueOnce(
      new Error("Recipe writing timed out after 180 seconds."),
    );
  await t.action(internal.catalogueGenerationActions.process, {
    runId: runId!,
  });
  const proposal = await admin.query(api.catalogueAdmin.getProposal, {
    proposalId,
  });
  expect(proposal).toMatchObject({
    revision: 1,
    findings: [finding],
    status: "pending_review",
    latestRun: { status: "failed", checkpointStage: "original_review" },
  });
  expect(proposal?.reviewedRevision).toBeUndefined();
  expect(provider.text).toHaveBeenCalledTimes(2);
  expect(provider.image).not.toHaveBeenCalled();
  expect(
    (
      await t.query(api.catalogue.getCurrentMealBySlug, {
        slug: "recoverable-rice",
      })
    )?.version,
  ).toBe(1);
});

test("a final review timeout preserves the written draft and recovery needs only culinary review", async () => {
  const { t, admin, proposalId, runId, revised } =
    await recoverableImprovement();
  provider.text
    .mockResolvedValueOnce({ findings: [] })
    .mockResolvedValueOnce(revised)
    .mockRejectedValueOnce(new Error("Culinary review timed out."));
  await t.action(internal.catalogueGenerationActions.process, {
    runId: runId!,
  });
  const proposal = (await admin.query(api.catalogueAdmin.getProposal, {
    proposalId,
  }))!;
  expect(proposal).toMatchObject({
    content: { description: "Improved rice." },
    revision: 2,
    status: "pending_review",
    changeSummary: ["Improved the sauce method."],
    latestRun: {
      status: "failed",
      checkpointStage: "authored",
      expectedRevision: 2,
    },
  });
  expect(proposal.reviewedRevision).toBeUndefined();
  await expect(
    admin.mutation(api.catalogueAdmin.begin, {
      operation: "image",
      requestKey: "no-bypass",
      proposalId,
      expectedRevision: 2,
    }),
  ).rejects.toThrow("culinary");
  provider.text.mockReset();
  provider.text.mockResolvedValue({ findings: [] });
  const reviewId = await admin.mutation(api.catalogueAdmin.begin, {
    operation: "review",
    requestKey: "recover-review",
    proposalId,
    expectedRevision: 2,
  });
  await t.action(internal.catalogueGenerationActions.process, {
    runId: reviewId,
  });
  expect(provider.text).toHaveBeenCalledOnce();
  expect(provider.text.mock.calls[0][0]).toBe("culinary_review");
  expect(
    (await admin.query(api.catalogueAdmin.getProposal, { proposalId }))
      ?.reviewedRevision,
  ).toBe(2);
  expect(
    (
      await t.query(api.catalogue.getCurrentMealBySlug, {
        slug: "recoverable-rice",
      })
    )?.description,
  ).toBeUndefined();
});

test("a concurrent administrator edit prevents stale authored progress and stops further paid calls", async () => {
  const { t, admin, proposalId, runId, revised } =
    await recoverableImprovement();
  provider.text
    .mockResolvedValueOnce({ findings: [] })
    .mockImplementationOnce(async () => {
      const p = (await admin.query(api.catalogueAdmin.getProposal, {
        proposalId,
      }))!;
      await admin.mutation(api.catalogueAdmin.updateProposal, {
        proposalId,
        revision: p.revision,
        content: { ...p.content, title: "Administrator's correction" },
        tags: p.tags,
      });
      return revised;
    });
  await t.action(internal.catalogueGenerationActions.process, {
    runId: runId!,
  });
  expect(provider.text).toHaveBeenCalledTimes(2);
  const proposal = (await admin.query(api.catalogueAdmin.getProposal, {
    proposalId,
  }))!;
  expect(proposal.content.title).toBe("Administrator's correction");
  expect(proposal.reviewedRevision).toBeUndefined();
  expect(proposal.latestRun?.status).toBe("failed");
});
