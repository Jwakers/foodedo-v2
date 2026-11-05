import { registerPlugin } from "@capacitor/core";
export type NativeRecipeCapture = {
  schemaVersion: 1;
  id: string;
  url: string;
  sharedText?: string;
  createdAt: number;
  claimedBy?: string;
};
export const recipeCapture = registerPlugin<{
  peek(): Promise<{ capture?: NativeRecipeCapture }>;
  claim(options: { id: string; owner: string }): Promise<void>;
  acknowledge(options: { id: string; owner: string }): Promise<void>;
}>("RecipeCapture");
