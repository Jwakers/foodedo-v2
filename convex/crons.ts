import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily(
  "delete expired shopping lists",
  { hourUTC: 3 },
  internal.shoppingLists.deleteExpired,
);

export default crons;
