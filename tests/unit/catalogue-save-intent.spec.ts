import { expect, test } from "@playwright/test";

import {
  createCatalogueSaveIntent,
  readCatalogueSaveIntent,
} from "../../src/lib/domain/auth-intents";

test("creates and validates a catalogue-save resume intent", () => {
  const intent = createCatalogueSaveIntent({
    catalogueVersion: 3,
    catalogueMealId: "meal-lemon-chicken",
    now: 1_725_000_000_000,
  });

  expect(intent).toEqual({
    schemaVersion: 1,
    type: "save-catalogue-recipe",
    catalogueVersion: 3,
    catalogueMealId: "meal-lemon-chicken",
    requestedAt: 1_725_000_000_000,
  });
  expect(readCatalogueSaveIntent(intent)?.catalogueMealId).toBe(
    "meal-lemon-chicken",
  );
});

test("rejects malformed catalogue-save intents", () => {
  expect(readCatalogueSaveIntent(null)).toBeNull();
  expect(
    readCatalogueSaveIntent({
      schemaVersion: 1,
      type: "save-catalogue-recipe",
      catalogueVersion: 0,
      catalogueMealId: "meal-lemon-chicken",
      requestedAt: 1,
    }),
  ).toBeNull();
  expect(
    readCatalogueSaveIntent({
      schemaVersion: 1,
      type: "save-catalogue-recipe",
      catalogueVersion: 3,
      catalogueMealId: "",
      requestedAt: 1,
    }),
  ).toBeNull();
  expect(
    readCatalogueSaveIntent({
      schemaVersion: 2,
      type: "save-catalogue-recipe",
      catalogueVersion: 3,
      catalogueMealId: "meal-lemon-chicken",
      requestedAt: 1,
    }),
  ).toBeNull();
});
