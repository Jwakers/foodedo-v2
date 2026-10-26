import { afterEach, expect, test, vi } from "vitest";
import { isCatalogueLunchtime } from "./lib/catalogueGeneration/config";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

test.each([undefined, "false", "true"])(
  "cron registration requires the deployment opt-in (%s)",
  async (enabled) => {
    vi.stubEnv("FOODEDO_CATALOGUE_SCHEDULE_ENABLED", enabled);
    vi.resetModules();
    const { default: crons } = await import("./crons");
    expect(crons.crons).toEqual(
      enabled === "true"
        ? {
            "expand-recipe-catalogue": {
              name: "catalogueGenerationActions:runScheduled",
              args: [{}],
              schedule: { type: "cron", cron: "0 11,12 * * 1,3,5" },
            },
          }
        : {},
    );
  },
);

test.each([
  ["2026-10-26T12:00:00Z", true], // Monday, GMT
  ["2026-10-26T11:00:00Z", false],
  ["2026-07-01T11:00:00Z", true], // Wednesday, BST
  ["2026-07-01T12:00:00Z", false],
  ["2026-03-27T12:00:00Z", true], // Friday before clocks change
  ["2026-03-30T11:00:00Z", true], // Monday after clocks change
  ["2026-10-23T11:00:00Z", true],
  ["2026-10-26T13:00:00Z", false],
  ["2026-10-27T12:00:00Z", false], // Tuesday
  ["2026-10-29T12:00:00Z", false], // Thursday
  ["2026-10-31T12:00:00Z", false], // Saturday
])("UK lunchtime guard at %s is %s", (date, expected) => {
  expect(isCatalogueLunchtime(Date.parse(date))).toBe(expected);
});
