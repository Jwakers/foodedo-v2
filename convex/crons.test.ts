import { expect, test } from "vitest";
import crons from "./crons";
import { catalogueSchedule } from "./lib/catalogueGeneration/config";

test("application config respects the catalogue schedule pause switch", () => {
  expect(crons.crons).toEqual(
    catalogueSchedule.enabled
      ? {
          "expand-recipe-catalogue": {
            name: "catalogueAdmin:beginScheduled",
            args: [{}],
            schedule: {
              type: "interval",
              minutes: catalogueSchedule.intervalMinutes,
            },
          },
        }
      : {},
  );
});
