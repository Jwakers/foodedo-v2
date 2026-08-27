import { RECIPE_LIMITS } from "./recipes";

export const CATALOGUE_SAVE_INTENT_SCHEMA_VERSION = 1 as const;

export type CatalogueSaveIntentV1 = {
  schemaVersion: typeof CATALOGUE_SAVE_INTENT_SCHEMA_VERSION;
  type: "save-catalogue-recipe";
  catalogueVersion: number;
  catalogueMealId: string;
  requestedAt: number;
};

export function createCatalogueSaveIntent({
  catalogueVersion,
  catalogueMealId,
  now,
}: {
  catalogueVersion: number;
  catalogueMealId: string;
  now: number;
}): CatalogueSaveIntentV1 {
  const intent = {
    schemaVersion: CATALOGUE_SAVE_INTENT_SCHEMA_VERSION,
    type: "save-catalogue-recipe",
    catalogueVersion,
    catalogueMealId,
    requestedAt: now,
  } as const;

  if (readCatalogueSaveIntent(intent) === null) {
    throw new Error("Catalogue save intent is invalid.");
  }
  return intent;
}

export function readCatalogueSaveIntent(
  input: unknown,
): CatalogueSaveIntentV1 | null {
  if (!isRecord(input)) return null;
  if (input.schemaVersion !== CATALOGUE_SAVE_INTENT_SCHEMA_VERSION) return null;
  if (input.type !== "save-catalogue-recipe") return null;
  if (
    typeof input.catalogueVersion !== "number" ||
    !Number.isInteger(input.catalogueVersion) ||
    input.catalogueVersion < 1
  ) {
    return null;
  }
  if (
    typeof input.catalogueMealId !== "string" ||
    input.catalogueMealId.trim().length === 0 ||
    input.catalogueMealId.length > RECIPE_LIMITS.catalogueMealId
  ) {
    return null;
  }
  if (
    typeof input.requestedAt !== "number" ||
    !Number.isInteger(input.requestedAt) ||
    input.requestedAt < 0
  ) {
    return null;
  }

  return {
    schemaVersion: CATALOGUE_SAVE_INTENT_SCHEMA_VERSION,
    type: "save-catalogue-recipe",
    catalogueVersion: input.catalogueVersion,
    catalogueMealId: input.catalogueMealId,
    requestedAt: input.requestedAt,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
