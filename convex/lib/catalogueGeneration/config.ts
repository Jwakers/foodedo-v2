export const generationConfig = {
  version: "catalogue-v13",
  promptVersion: "culinary-v5",
  imageStyleVersion: "natural-food-v5",
  textModel: "openai/gpt-5.4",
  imageModel: "google/gemini-3-pro-image",
  imageSize: "2K",
  reasoningEffort: "medium",
  selectionReasoningEffort: "low",
  deadlineMs: 300_000,
  textCallTimeoutMs: 180_000,
  reviewCallTimeoutMs: 120_000,
  maxTextCalls: 4,
  maxOutputTokens: 10_000,
  enrichmentBatchSize: 5,
  catalogueLimit: 1000,
  imageBytes: 20 * 1024 * 1024,
} as const;

// Scheduling policy is separate from the snapshotted AI/provider configuration.
export const scheduledGenerationPolicy = {
  maxUnreviewedProposals: 5,
} as const;

// Opt in per deployment; leave unset in development and preview deployments.
export const catalogueSchedule = {
  get enabled() {
    return process.env.FOODEDO_CATALOGUE_SCHEDULE_ENABLED === "true";
  },
  // Convex cron schedules are UTC. The Node action selects UK noon from these
  // two candidates so the schedule follows GMT/BST without seasonal redeploys.
  cron: "0 11,12 * * 1,3,5",
  timeZone: "Europe/London",
} as const;

// More room for review → full revision → independent review (and one repair).
// This remains below Convex's ten-minute Node action limit.
export const improvementLimits = { deadlineMs: 480_000 } as const;

// Called in the Node runtime, which supplies IANA timezone data.
export function isCatalogueLunchtime(now: number): boolean {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: catalogueSchedule.timeZone,
    weekday: "short",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const weekday = parts.find((part) => part.type === "weekday")?.value;
  const hour = parts.find((part) => part.type === "hour")?.value;
  return ["Mon", "Wed", "Fri"].includes(weekday ?? "") && hour === "12";
}
