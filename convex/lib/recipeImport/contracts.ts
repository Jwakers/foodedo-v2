export const RECIPE_IMPORT_LIMITS = {
  htmlBytes: 2_000_000,
  imageBytes: 8_000_000,
  modelSourceCharacters: 60_000,
  redirects: 5,
  fetchTimeoutMs: 10_000,
} as const;

export const CURRENT_IMPORT_FAILURE_CODES = [
  "invalid_url",
  "unsafe_url",
  "source_unreachable",
  "source_blocked",
  "unsupported_content",
  "no_recipe",
  "incomplete_recipe",
  "unsafe_result",
  "ai_unavailable",
  "internal",
  "timed_out",
] as const;
export type CurrentImportFailureCode =
  (typeof CURRENT_IMPORT_FAILURE_CODES)[number];

/** Read compatibility for jobs created by importer versions before v4. */
export type LegacyImportFailureCode = "fetch_failed" | "invalid_result";
export const RECIPE_IMPORT_FAILURE_CODES = [
  ...CURRENT_IMPORT_FAILURE_CODES,
  "fetch_failed",
  "invalid_result",
] as const;

export type ImportFailureCode =
  CurrentImportFailureCode | LegacyImportFailureCode;

/**
 * Safe, source-free diagnostics for a failed AI normalization. These are kept
 * separately from the failure code so retry UI and operational logs can
 * distinguish a malformed model contract from a source-coverage rejection.
 */
export const RECIPE_IMPORT_FAILURE_DETAILS = [
  "contract",
  "metadata",
  "ingredients",
  "method",
  "notes",
] as const;

export type RecipeImportFailureDetail =
  (typeof RECIPE_IMPORT_FAILURE_DETAILS)[number];

export const RECIPE_IMPORT_FAILURE_REASONS = [
  "source_reference",
  "measurement",
  "quantity_scope",
  "omission",
  "instruction",
  "alternative",
  "formatting",
  "note_reference",
  "truncated_source",
] as const;

export class ImportFailure extends Error {
  constructor(
    readonly code: CurrentImportFailureCode,
    message: string,
    readonly details?: RecipeImportFailureDetail[],
    readonly sourceIds?: string[],
    readonly reasons?: string[],
  ) {
    super(message);
    this.name = "ImportFailure";
  }
}

export function importFailureCode(error: unknown): CurrentImportFailureCode {
  return error instanceof ImportFailure ? error.code : "internal";
}
