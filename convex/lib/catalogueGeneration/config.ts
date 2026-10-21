export const generationConfig = {
  version: "catalogue-v5",
  promptVersion: "culinary-v3",
  imageStyleVersion: "natural-food-v3",
  textModel: "openai/gpt-5.4",
  imageModel: "google/gemini-3-pro-image",
  imageSize: "2K",
  reasoningEffort: "medium",
  selectionReasoningEffort: "low",
  deadlineMs: 300_000,
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

// Pause scheduled generation by setting enabled to false and syncing Convex.
export const catalogueSchedule = {
  enabled: true,
  intervalMinutes: 30,
} as const;
