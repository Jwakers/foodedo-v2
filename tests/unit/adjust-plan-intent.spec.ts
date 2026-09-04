import { expect, test } from "@playwright/test";

import {
  createAdjustPlanIntent,
  readAdjustPlanIntent,
} from "../../src/lib/domain/auth-intents";

test("creates and validates an adjust-plan resume intent", () => {
  const intent = createAdjustPlanIntent({ now: 1_725_000_000_000 });

  expect(intent).toEqual({
    schemaVersion: 1,
    type: "open-adjust-plan",
    requestedAt: 1_725_000_000_000,
  });
  expect(readAdjustPlanIntent(intent)?.type).toBe("open-adjust-plan");
});

test("rejects malformed adjust-plan intents", () => {
  expect(readAdjustPlanIntent(null)).toBeNull();
  expect(
    readAdjustPlanIntent({
      schemaVersion: 1,
      type: "open-adjust-plan",
      requestedAt: -1,
    }),
  ).toBeNull();
  expect(
    readAdjustPlanIntent({
      schemaVersion: 2,
      type: "open-adjust-plan",
      requestedAt: 1,
    }),
  ).toBeNull();
});
