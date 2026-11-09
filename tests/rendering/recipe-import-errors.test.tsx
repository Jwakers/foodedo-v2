import { expect, test } from "vitest";
import { ConvexError } from "convex/values";
import { recipeImportErrorMessage } from "@/features/recipes/recipe-import-errors";

test("import limits surface actionable server messages while unexpected errors retain the safe fallback", () => {
  for (const code of [
    "IMPORTED_RECIPE_LIMIT",
    "IMPORT_ALLOWANCE_EXHAUSTED",
    "IMPORT_CONCURRENCY_LIMIT",
  ]) {
    expect(
      recipeImportErrorMessage(
        new ConvexError({
          code,
          message: "Remove an imported recipe before adding another.",
        }),
        "Try again",
      ),
    ).toBe("Remove an imported recipe before adding another.");
  }
  expect(
    recipeImportErrorMessage(
      new Error("Sensitive provider failure"),
      "Try again",
    ),
  ).toBe("Try again");
  expect(
    recipeImportErrorMessage(
      new ConvexError({ code: "INTERNAL", message: "Provider internals" }),
      "Try again",
    ),
  ).toBe("Try again");
});
