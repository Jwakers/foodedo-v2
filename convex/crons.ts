import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";
import { catalogueSchedule } from "./lib/catalogueGeneration/config";

const crons = cronJobs();

// Registration and the scheduled entry point share the same pause switch.
if (catalogueSchedule.enabled) {
  crons.cron(
    "expand-recipe-catalogue",
    catalogueSchedule.cron,
    internal.catalogueGenerationActions.runScheduled,
    {},
  );
}

export default crons;
