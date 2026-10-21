import { expect, test } from "vitest";
import crons from "./crons";
import { catalogueSchedule } from "./lib/catalogueGeneration/config";

test("application config registers one guarded catalogue run every 30 minutes", () => {
  expect(catalogueSchedule.enabled).toBe(true);
  expect(crons.crons).toEqual({
    "expand-recipe-catalogue": {
      name: "catalogueAdmin:beginScheduled",
      args: [{}],
      schedule: { type: "interval", minutes: 30 },
    },
  });
});
