// @vitest-environment node

import { describe, expect, test } from "vitest";

import {
  validateAndResolveReview,
  type CandidateFile,
  type DecisionsFile,
} from "./cli";
import type { MigrationCandidate } from "./transform";

function candidate(index: number): MigrationCandidate {
  return {
    legacyV1RecipeId: `v1-${index}`,
    inSeed: true,
    flags: [],
    imageUrl: `https://example.com/${index}.webp`,
    imageFile: `images/${index}.webp`,
    imageSha256: `hash-${index}`,
    meal: {
      id: `meal-${index}`,
      slug: `meal-${index}`,
      version: 1,
      title: `Meal ${index}`,
      ingredients: [
        {
          id: `ingredient-${index}`,
          name: "beans",
          shoppingCategory: "pantry",
        },
      ],
      steps: [{ id: `step-${index}`, text: "Cook for 10 minutes." }],
      proteinCategory: index % 2 ? "chicken" : "meat-free",
      costBand: "budget",
      servingScaling: "safe",
    },
    inferred: {
      costBand: {
        value: "budget",
        evidence: ["rubric"],
        requiresApproval: true,
      },
    },
  };
}

function fixtures() {
  const candidates = Array.from({ length: 7 }, (_, index) => candidate(index));
  const candidateFile: CandidateFile = {
    schemaVersion: 1,
    extractedAt: "2026-10-02T12:00:00.000Z",
    expectedSourceCount: 113,
    sourceSnapshotHash: "snapshot",
    sourceIds: candidates.map((item) => item.legacyV1RecipeId),
    candidates,
  };
  const decisions: DecisionsFile = {
    schemaVersion: 1,
    sourceSnapshotHash: "snapshot",
    reviewer: "Jack",
    approvedAt: "2026-10-02T13:00:00.000Z",
    homeMealIds: candidates.slice(0, 6).map((item) => item.meal.id),
    recipes: Object.fromEntries(
      candidates.map((item) => [
        item.legacyV1RecipeId,
        {
          decision: "keep",
          approvals: { costBand: true },
          overrides: {},
        },
      ]),
    ),
  };
  return { candidateFile, decisions };
}

describe("catalogue migration review gate", () => {
  test("requires a matching frozen snapshot", () => {
    const { candidateFile, decisions } = fixtures();
    decisions.sourceSnapshotHash = "different";
    expect(() => validateAndResolveReview(candidateFile, decisions)).toThrow(
      "different source snapshot",
    );
  });

  test("requires every inference approval", () => {
    const { candidateFile, decisions } = fixtures();
    decisions.recipes["v1-0"]!.approvals.costBand = null;
    expect(() => validateAndResolveReview(candidateFile, decisions)).toThrow(
      "requires costBand approval",
    );
  });

  test("requires exactly six accepted Home meals and orders the remainder", () => {
    const { candidateFile, decisions } = fixtures();
    const resolved = validateAndResolveReview(candidateFile, decisions);
    expect(resolved.orderedMealIds.slice(0, 6)).toEqual(decisions.homeMealIds);
    expect(resolved.orderedMealIds).toHaveLength(7);

    decisions.homeMealIds = decisions.homeMealIds.slice(0, 5);
    expect(() => validateAndResolveReview(candidateFile, decisions)).toThrow(
      "Exactly six unique Home meal IDs",
    );
  });

  test("rejects keeping an image-less recipe without a replacement", () => {
    const { candidateFile, decisions } = fixtures();
    delete candidateFile.candidates[0]!.imageFile;
    delete candidateFile.candidates[0]!.imageSha256;
    expect(() => validateAndResolveReview(candidateFile, decisions)).toThrow(
      "requires a replacement image or removal",
    );
  });
});
