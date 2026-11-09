import { ConvexError } from "convex/values";

const limitCodes = new Set([
  "IMPORTED_RECIPE_LIMIT",
  "IMPORT_ALLOWANCE_EXHAUSTED",
  "IMPORT_CONCURRENCY_LIMIT",
]);

export function recipeImportErrorMessage(
  error: unknown,
  fallback: string,
): string {
  if (
    !(error instanceof ConvexError) ||
    typeof error.data !== "object" ||
    error.data === null
  )
    return fallback;
  const data: unknown = error.data;
  if (
    typeof data !== "object" ||
    data === null ||
    !("code" in data) ||
    !("message" in data)
  )
    return fallback;
  return typeof data.code === "string" &&
    limitCodes.has(data.code) &&
    typeof data.message === "string" &&
    data.message.length <= 500
    ? data.message
    : fallback;
}
