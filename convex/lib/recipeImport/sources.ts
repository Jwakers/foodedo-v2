"use node";

import { extractTextCandidate, extractUrlCandidate } from "./source";
import { maybeAcquireYouTubeSource } from "./youtube";
import { socialImportPlatform } from "../../../src/lib/domain/social-import";
import {
  acquireInstagramSource,
  type InstagramAcquisitionSummary,
} from "./instagram";

export type RecipeSourceInput =
  | { type: "url"; url: string; sharedText?: string }
  | { type: "text"; text: string };

export async function acquireRecipeSource(
  input: RecipeSourceInput,
  options?: {
    onRunStarted?: (runId: string) => Promise<void>;
    onAcquired?: (summary: InstagramAcquisitionSummary) => Promise<void>;
  },
) {
  if (input.type === "text") return extractTextCandidate(input.text);
  if (socialImportPlatform(input.url) === "instagram") {
    return acquireInstagramSource(input.url, input.sharedText, {
      deadline: Date.now() + 45_000,
      ...options,
    });
  }
  const youTubeCandidate = await maybeAcquireYouTubeSource(input.url);
  if (youTubeCandidate) return youTubeCandidate;
  return extractUrlCandidate(input.url);
}
