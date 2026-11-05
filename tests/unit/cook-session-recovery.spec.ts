import { expect, test } from "@playwright/test";
import {
  emptyCookSession,
  type CookRecipeContext,
} from "../../src/lib/domain/cook-session";
import {
  COOK_SESSION_MAX_AGE_MS,
  recoverCookSession,
  storeCookSession,
} from "../../src/lib/domain/cook-session-recovery";

const context: CookRecipeContext = {
  catalogueVersion: 1,
  servings: 2,
  meal: {
    id: "dinner",
    slug: "dinner",
    title: "Dinner",
    version: 1,
    position: 0,
    proteinCategory: "meat-free",
    servings: 2,
    ingredients: [],
    steps: [
      { id: "one", text: "Cook." },
      { id: "two", text: "Serve." },
    ],
  },
};
const started = {
  ...emptyCookSession(context),
  phase: { name: "step", stepIndex: 1 } as const,
};
const savedAt = 1_800_000_000_000;

test("recovers progress within one day and starts fresh at the 24-hour boundary", () => {
  const stored = storeCookSession(started, savedAt);
  expect(
    recoverCookSession(stored, context, savedAt + COOK_SESSION_MAX_AGE_MS - 1),
  ).toEqual(started);
  for (const age of [COOK_SESSION_MAX_AGE_MS, COOK_SESSION_MAX_AGE_MS * 7]) {
    expect(recoverCookSession(stored, context, savedAt + age)).toEqual(
      emptyCookSession(context),
    );
  }
});

test("discards undated legacy progress and invalid or future timestamps", () => {
  for (const value of [
    started,
    null,
    { session: started },
    ...[NaN, Infinity, "today", savedAt + 1].map((savedAt) => ({
      session: started,
      savedAt,
    })),
  ]) {
    expect(recoverCookSession(value, context, savedAt)).toEqual(
      emptyCookSession(context),
    );
  }
});

test("fresh storage still validates recipe identity and revision", () => {
  expect(
    recoverCookSession(
      storeCookSession({ ...started, catalogueVersion: 0 }, savedAt),
      context,
      savedAt,
    ),
  ).toEqual(emptyCookSession(context));
});
