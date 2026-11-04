"use node";

import {
  extractTextCandidate,
  extractUrlCandidate,
  type RecipeSourceCandidate,
} from "./source";
import { maybeAcquireYouTubeSource } from "./youtube";

export type RecipeSourceInput =
  { type: "url"; url: string } | { type: "text"; text: string };

/** Future rendered HTML/transcript adapters produce evidence, never a saved recipe. */
export interface RecipeSourceAdapter<Input> {
  acquire(input: Input): Promise<RecipeSourceCandidate>;
}
export type RenderedPageAdapter = RecipeSourceAdapter<{
  url: string;
  deadline: number;
}>;

export const urlRecipeSource: RecipeSourceAdapter<{ url: string }> = {
  acquire: ({ url }) => extractUrlCandidate(url),
};
export const pastedRecipeSource: RecipeSourceAdapter<{ text: string }> = {
  acquire: async ({ text }) => extractTextCandidate(text),
};

export async function acquireRecipeSource(input: RecipeSourceInput) {
  if (input.type === "text") return pastedRecipeSource.acquire(input);
  const youTubeCandidate = await maybeAcquireYouTubeSource(input.url);
  if (youTubeCandidate) return youTubeCandidate;
  return urlRecipeSource.acquire(input);
}
