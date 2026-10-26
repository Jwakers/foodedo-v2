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

// Pause scheduled generation by setting enabled to false and syncing Convex.
export const catalogueSchedule = {
  enabled: false,
  intervalMinutes: 30,
} as const;

// More room for review → full revision → independent review (and one repair).
// This remains below Convex's ten-minute Node action limit.
export const improvementLimits = { deadlineMs: 480_000 } as const;
