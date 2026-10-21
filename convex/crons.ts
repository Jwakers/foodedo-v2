import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";
import { catalogueSchedule } from "./lib/catalogueGeneration/config";

const crons = cronJobs();

// Registration and the scheduled entry point share the same pause switch.
if (catalogueSchedule.enabled) {
  crons.interval(
    "expand-recipe-catalogue",
    { minutes: catalogueSchedule.intervalMinutes },
    internal.catalogueAdmin.beginScheduled,
    {},
  );
}

export default crons;
