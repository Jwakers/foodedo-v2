"use node";

import {
  extractTextCandidate,
  extractUrlCandidate,
  type RecipeSourceCandidate,
} from "./source";

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

export function acquireRecipeSource(input: RecipeSourceInput) {
  return input.type === "url"
    ? urlRecipeSource.acquire(input)
    : pastedRecipeSource.acquire(input);
}
