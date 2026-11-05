// @vitest-environment node
import { expect, it } from "vitest";
import { organiseCandidate } from "./extraction";
import { extractTextCandidate } from "./source";
import type { RecipeImportModelClient } from "./models";

const videoClient: RecipeImportModelClient = {
  async generate(task) {
    return task.schema.parse({ result: { status: "video_only_unsupported" } });
  },
};
it("classifies an apparent video recipe only from accessible complete video evidence", async () => {
  const candidate = extractTextCandidate(
    "Chicken curry: watch the video for the ingredients and cooking method.",
  );
  candidate.socialEvidence = {
    platform: "youtube",
    mediaType: "video",
    captionComplete: true,
    linkedContentUnavailable: false,
  };
  await expect(organiseCandidate(candidate, videoClient)).rejects.toMatchObject(
    { code: "video_only_unsupported" },
  );
});
it.each(["blocked_link", "incomplete_caption", "image", "unknown"])(
  "does not turn %s evidence into a video-only demand signal",
  async (kind) => {
    const candidate = extractTextCandidate(
      "Watch the video for my chicken curry.",
    );
    if (kind !== "unknown")
      candidate.socialEvidence = {
        platform: "instagram",
        mediaType: kind === "image" ? "image" : "video",
        captionComplete: kind !== "incomplete_caption",
        linkedContentUnavailable: kind === "blocked_link",
      };
    await expect(
      organiseCandidate(candidate, videoClient),
    ).rejects.toMatchObject({ code: "no_recipe" });
  },
);

it("recovers written ingredients into a draft rather than recording video-only demand", async () => {
  const source = extractTextCandidate(
    "Pancake batter\n125g rice flour\n200ml coconut cream\nWatch the video for the method.",
  );
  source.socialEvidence = {
    platform: "instagram",
    mediaType: "video",
    captionComplete: true,
    linkedContentUnavailable: false,
  };
  const roles: string[] = [];
  const issue = {
    area: "method",
    code: "partial_coverage",
    targetId: null,
    message: "Cooking method is missing.",
    blocking: true,
  };
  const result = await organiseCandidate(source, {
    async generate(task) {
      roles.push(task.role);
      if (task.role === "normalize")
        return task.schema.parse({
          result: { status: "video_only_unsupported" },
        });
      if (task.role === "correct")
        return task.schema.parse({
          sourceStatus: "recipe",
          changes: [],
          issues: [issue],
        });
      return task.schema.parse({
        result: {
          status: "recipe",
          recipe: {
            title: "Pancake batter",
            titleSourceIds: ["B1"],
            description: null,
            servings: null,
            minimumServings: null,
            prepMinutes: null,
            cookMinutes: null,
            proteinCategory: "meat-free",
            ingredients: [
              {
                sourceIds: ["B1"],
                name: "rice flour",
                amount: {
                  kind: "exact",
                  value: 125,
                  unit: "g",
                  qualifier: null,
                  equivalents: [],
                },
                note: null,
                group: null,
                noteRefs: [],
                shoppingCategory: "pantry",
              },
              {
                sourceIds: ["B1"],
                name: "coconut cream",
                amount: {
                  kind: "exact",
                  value: 200,
                  unit: "ml",
                  qualifier: null,
                  equivalents: [],
                },
                note: null,
                group: null,
                noteRefs: [],
                shoppingCategory: "pantry",
              },
            ],
            steps: [],
            notes: [],
          },
          issues: [issue],
        },
      });
    },
  });
  expect(roles).toEqual(["normalize", "recover", "correct"]);
  expect(result.status).toBe("draft");
  expect(result.recipe.ingredients.map((x) => x.amountText)).toEqual([
    "125 g",
    "200 ml",
  ]);
  expect(result.recipe.steps).toEqual([]);
});
it("never records a video-only signal when the model still rejects written quantities", async () => {
  const source = extractTextCandidate(
    "BATTER\n125g rice flour\n200ml coconut cream",
  );
  source.socialEvidence = {
    platform: "instagram",
    mediaType: "video",
    captionComplete: true,
    linkedContentUnavailable: false,
  };
  await expect(organiseCandidate(source, videoClient)).rejects.toMatchObject({
    code: "no_recipe",
  });
});
