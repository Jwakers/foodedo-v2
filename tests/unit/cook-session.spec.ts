import { expect, test } from "@playwright/test";

import {
  cookTimerId,
  emptyCookSession,
  reduceCookSession,
  remainingTimerSeconds,
  restoreCookSession,
  type CookRecipeContext,
} from "../../src/lib/domain/cook-session";
import type { CatalogueMeal } from "../../src/lib/domain/recipes";

const catalogueFixture = { version: 2 };
const meal: CatalogueMeal = {
  id: "cook-test-meal",
  version: 2,
  slug: "cook-test-meal",
  position: 0,
  title: "Cook test meal",
  servings: 4,
  proteinCategory: "chicken",
  ingredients: [
    {
      id: "ingredient-1",
      name: "test ingredient",
      shoppingCategory: "pantry",
    },
  ],
  steps: [
    { id: "step-1", text: "Prepare the ingredient." },
    { id: "step-2", text: "Add it to the pan." },
    {
      id: "step-3",
      text: "Cook until ready.",
      timerCues: [{ id: "cook", label: "Cook", durationSeconds: 600 }],
    },
  ],
};
const context: CookRecipeContext = {
  catalogueVersion: catalogueFixture.version,
  meal,
  servings: meal.servings!,
};
const cue = meal.steps[2]!.timerCues![0]!;
const timerId = cookTimerId(meal.steps[2]!.id, cue.id);

test("creates a versioned recoverable Cook session per recipe", () => {
  expect(emptyCookSession(context)).toEqual({
    schemaVersion: 1,
    catalogueVersion: catalogueFixture.version,
    recipeSlug: meal.slug,
    servings: 4,
    phase: { name: "preparation" },
    preparedIngredientIds: [],
    scrollPositions: { preparation: 0, step: 0, ingredients: 0 },
    timers: [],
  });
});

test("moves through preparation and steps, including Previous from step one", () => {
  const ingredientId = meal.ingredients[0]!.id;
  let session = reduceCookSession(emptyCookSession(context), {
    type: "toggle-prepared",
    ingredientId,
  });
  expect(session.preparedIngredientIds).toEqual([ingredientId]);

  session = reduceCookSession(session, { type: "start-cooking" });
  expect(session.phase).toEqual({ name: "step", stepIndex: 0 });
  session = reduceCookSession(session, { type: "previous-step" });
  expect(session.phase).toEqual({ name: "preparation" });
});

test("persists the Ingredients return step and independent scroll positions", () => {
  let session = reduceCookSession(emptyCookSession(context), {
    type: "start-cooking",
  });
  session = reduceCookSession(session, {
    type: "set-scroll",
    surface: "step",
    scrollTop: 420,
  });
  session = reduceCookSession(session, { type: "show-ingredients" });
  session = reduceCookSession(session, {
    type: "set-scroll",
    surface: "ingredients",
    scrollTop: 180,
  });

  expect(session.phase).toEqual({ name: "ingredients", returnStepIndex: 0 });
  expect(session.scrollPositions).toMatchObject({
    step: 420,
    ingredients: 180,
  });
  expect(restoreCookSession(session, context)).toEqual(session);
  expect(
    reduceCookSession(session, { type: "hide-ingredients" }).phase,
  ).toEqual({ name: "step", stepIndex: 0 });
});

test("derives running and paused timer time from the wall clock", () => {
  expect(
    remainingTimerSeconds(
      {
        id: timerId,
        stepId: meal.steps[2]!.id,
        cueId: cue.id,
        label: cue.label,
        durationSeconds: 600,
        remainingSeconds: 600,
        startedAt: 1_000,
      },
      121_000,
    ),
  ).toBe(480);
  expect(
    remainingTimerSeconds({
      id: timerId,
      stepId: meal.steps[2]!.id,
      cueId: cue.id,
      label: cue.label,
      durationSeconds: 600,
      remainingSeconds: 480,
      startedAt: null,
    }),
  ).toBe(480);
});

test("starts, pauses, resumes, expires, restarts, and cancels a timer", () => {
  let session = reduceCookSession(emptyCookSession(context), {
    type: "start-timer",
    stepId: meal.steps[2]!.id,
    cue,
    now: 1_000,
  });
  expect(session.timers[0]?.startedAt).toBe(1_000);

  session = reduceCookSession(session, {
    type: "toggle-timer",
    timerId,
    now: 61_000,
  });
  expect(session.timers[0]).toMatchObject({
    remainingSeconds: cue.durationSeconds - 60,
    startedAt: null,
  });

  session = reduceCookSession(session, {
    type: "toggle-timer",
    timerId,
    now: 80_000,
  });
  expect(session.timers[0]?.startedAt).toBe(80_000);

  session = reduceCookSession(session, {
    type: "toggle-timer",
    timerId,
    now: 80_000 + cue.durationSeconds * 1_000,
  });
  expect(session.timers[0]).toMatchObject({
    remainingSeconds: cue.durationSeconds,
    startedAt: 80_000 + cue.durationSeconds * 1_000,
  });

  session = reduceCookSession(session, {
    type: "restart-timer",
    timerId,
    now: 99_000,
  });
  expect(remainingTimerSeconds(session.timers[0]!, 99_000)).toBe(
    cue.durationSeconds,
  );
  session = reduceCookSession(session, { type: "cancel-timer", timerId });
  expect(session.timers).toEqual([]);
});

test("starting an expired cue creates a fresh timer instance", () => {
  let session = reduceCookSession(emptyCookSession(context), {
    type: "start-timer",
    stepId: meal.steps[2]!.id,
    cue,
    now: 1_000,
  });
  const restartedAt = 1_000 + cue.durationSeconds * 1_000 + 5_000;
  session = reduceCookSession(session, {
    type: "start-timer",
    stepId: meal.steps[2]!.id,
    cue,
    now: restartedAt,
  });
  expect(session.timers).toHaveLength(1);
  expect(session.timers[0]).toMatchObject({
    remainingSeconds: cue.durationSeconds,
    startedAt: restartedAt,
  });
});

test("does not add time when a clock sample predates a restarted timer", () => {
  expect(
    remainingTimerSeconds(
      {
        id: timerId,
        stepId: meal.steps[2]!.id,
        cueId: cue.id,
        label: cue.label,
        durationSeconds: 1800,
        remainingSeconds: 1800,
        startedAt: 10_000,
      },
      8_000,
    ),
  ).toBe(1800);
});

test("resets stale, malformed, or out-of-range recovery data", () => {
  const valid = emptyCookSession(context);
  expect(restoreCookSession({ ...valid, schemaVersion: 0 }, context)).toEqual(
    valid,
  );
  expect(
    restoreCookSession(
      { ...valid, phase: { name: "step", stepIndex: 999 } },
      context,
    ),
  ).toEqual(valid);
  expect(
    restoreCookSession(
      { ...valid, catalogueVersion: context.catalogueVersion - 1 },
      context,
    ),
  ).toEqual(valid);
});

test("completion is an explicit terminal transition", () => {
  const started = reduceCookSession(emptyCookSession(context), {
    type: "start-cooking",
  });
  expect(reduceCookSession(started, { type: "complete" }).phase).toEqual({
    name: "complete",
  });
});
