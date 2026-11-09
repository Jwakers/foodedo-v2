import { expect, test } from "@playwright/test";
import {
  confirmRecipeImportSharing,
  recipeImportSharingNotice,
} from "../../src/lib/platform/recipe-import-permission";

test("native import requires explicit permission and web imports retain their current flow", () => {
  const notices: string[] = [];
  const cancel = (notice: string) => {
    notices.push(notice);
    return false;
  };
  expect(confirmRecipeImportSharing(true, cancel)).toBe(false);
  expect(notices).toEqual([recipeImportSharingNotice]);
  expect(confirmRecipeImportSharing(true, () => true)).toBe(true);
  expect(
    confirmRecipeImportSharing(false, () => {
      throw new Error("Web must not prompt");
    }),
  ).toBe(true);
});
