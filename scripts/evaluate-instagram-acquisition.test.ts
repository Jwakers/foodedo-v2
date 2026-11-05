// @vitest-environment node
import { expect, it } from "vitest";
import {
  evaluateResult,
  summarize,
  type BenchmarkRow,
} from "./evaluate-instagram-acquisition";

const item = {
  id: "one",
  url: "https://instagram.com/p/Cexample123/",
  category: "caption" as const,
  expectedFragments: ["carrot", "water", "boil"],
  reviewed: true as const,
  expectedOutcome: "usable" as const,
};
it("requires verified usable output, not just a retrieved caption or an editable draft", () => {
  const result = {
    acquired: true,
    latencyMs: 10,
    missingFragments: [],
    normalization: {
      outcome: "usable",
      usable: true,
      verified: false,
      missingFacts: ["ingredient:carrot"],
      modelCalls: 2,
      latencyMs: 20,
    },
  };
  expect(evaluateResult(item, result, true).recipePassed).toBe(false);
  expect(
    evaluateResult(
      item,
      {
        ...result,
        normalization: {
          ...result.normalization,
          verified: true,
          missingFacts: [],
        },
      },
      true,
    ).recipePassed,
  ).toBe(true);
  expect(
    evaluateResult(
      item,
      {
        ...result,
        normalization: {
          ...result.normalization,
          outcome: "draft",
          usable: false,
          verified: true,
        },
      },
      true,
    ).recipePassed,
  ).toBe(false);
});
it("only an explicit expected rejection can pass an inaccessible case", () => {
  const missing = {
    ...item,
    category: "inaccessible" as const,
    expectedOutcome: "not_found" as const,
  };
  for (const outcome of [
    "timed_out",
    "invalid_response",
    "internal",
    "unavailable",
  ])
    expect(
      evaluateResult(
        missing,
        { acquired: false, latencyMs: 40_000, outcome },
        true,
      ).recipePassed,
    ).toBe(false);
  expect(
    evaluateResult(
      missing,
      { acquired: false, latencyMs: 100, outcome: "not_found" },
      true,
    ).recipePassed,
  ).toBe(true);
});
it("keeps unknown harness timing out of acquisition p95 without removing the failed attempt", () => {
  const base: BenchmarkRow = {
    id: "one",
    category: "caption",
    repeat: 1,
    supported: true,
    harnessOutcome: "completed",
    harnessMs: 50,
    acquisitionMs: 30,
    acquisitionPassed: true,
    recipePassed: true,
  };
  const result = summarize([
    base,
    {
      ...base,
      repeat: 2,
      harnessOutcome: "harness_timeout",
      harnessMs: 90_000,
      acquisitionMs: null,
      acquisitionPassed: null,
      recipePassed: null,
    },
  ]);
  expect(result).toMatchObject({
    distinctSupportedPosts: 1,
    supportedAttempts: 2,
    acquisitionSuccessRate: 0.5,
    p95AcquisitionMs: 30,
    harnessFailures: 1,
    qualified: false,
  });
});

it("does not turn an evaluation budget stop into a successful unsupported-content result", () => {
  const negative = {
    ...item,
    category: "bio_only" as const,
    expectedOutcome: "not_usable" as const,
  };
  expect(
    evaluateResult(
      negative,
      {
        acquired: true,
        latencyMs: 10,
        normalization: {
          outcome: "evaluation_budget_limited",
          usable: false,
          verified: false,
          missingFacts: [],
          modelCalls: 1,
          latencyMs: 20,
        },
      },
      true,
    ).recipePassed,
  ).toBe(false);
});
