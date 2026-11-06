"use node";

import { extractTextCandidate, extractUrlCandidate } from "./source";
import { maybeAcquireYouTubeSource } from "./youtube";
import {
  socialImportPlatform,
  isApifySocialPlatform,
} from "../../../src/lib/domain/social-import";
import { acquireInstagramSource } from "./instagram";
import { acquireTikTokSource } from "./tiktok";
import type { SocialAcquisitionSummary } from "./socialSource";

export type RecipeSourceInput =
  | { type: "url"; url: string; sharedText?: string }
  | { type: "text"; text: string };

export async function acquireRecipeSource(
  input: RecipeSourceInput,
  options?: {
    onRunStarted?: (runId: string) => Promise<void>;
    onAcquired?: (summary: SocialAcquisitionSummary) => Promise<void>;
  },
) {
  if (input.type === "text") return extractTextCandidate(input.text);
  const platform = socialImportPlatform(input.url);
  if (isApifySocialPlatform(platform)) {
    const acquire =
      platform === "instagram" ? acquireInstagramSource : acquireTikTokSource;
    return acquire(input.url, input.sharedText, {
      deadline: Date.now() + 45_000,
      ...options,
    });
  }
  const youTubeCandidate = await maybeAcquireYouTubeSource(input.url);
  if (youTubeCandidate) return youTubeCandidate;
  return extractUrlCandidate(input.url);
}
