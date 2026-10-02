import { RECIPE_LIMITS } from "./recipes";
import { RECIPE_IMPORT_INPUT_LIMITS } from "./recipe-import";

/**
 * Auth-continuation intents: tiny durable records written *before* sign-in so
 * the app can resume one job after authentication (OAuth redirect, reload, or
 * modal completion). Validate on read; clear after success or abandon.
 *
 * Guest plan claiming is different — the claim key lives on `GuestDraft` and
 * is submitted with the draft payload, not stored here.
 */
export const CATALOGUE_SAVE_INTENT_SCHEMA_VERSION = 1 as const;
export const ADJUST_PLAN_INTENT_SCHEMA_VERSION = 1 as const;
export const RECIPE_IMPORT_INTENT_SCHEMA_VERSION = 1 as const;

export type CatalogueSaveIntentV1 = {
  schemaVersion: typeof CATALOGUE_SAVE_INTENT_SCHEMA_VERSION;
  type: "save-catalogue-recipe";
  catalogueVersion: number;
  catalogueMealId: string;
  requestedAt: number;
};

/** Resume the Adjust sheet after guest “Sign in to personalise”. */
export type AdjustPlanIntentV1 = {
  schemaVersion: typeof ADJUST_PLAN_INTENT_SCHEMA_VERSION;
  type: "open-adjust-plan";
  requestedAt: number;
};

export type RecipeImportIntentV1 = {
  schemaVersion: typeof RECIPE_IMPORT_INTENT_SCHEMA_VERSION;
  type: "import-recipe";
  clientRequestId: string;
  source: { type: "url"; url: string } | { type: "text"; text: string };
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

  const requestedAt = readRequestedAt(input.requestedAt);
  if (requestedAt === null) return null;

  return {
    schemaVersion: CATALOGUE_SAVE_INTENT_SCHEMA_VERSION,
    type: "save-catalogue-recipe",
    catalogueVersion: input.catalogueVersion,
    catalogueMealId: input.catalogueMealId,
    requestedAt,
  };
}

export function createAdjustPlanIntent({
  now,
}: {
  now: number;
}): AdjustPlanIntentV1 {
  const intent = {
    schemaVersion: ADJUST_PLAN_INTENT_SCHEMA_VERSION,
    type: "open-adjust-plan",
    requestedAt: now,
  } as const;

  if (readAdjustPlanIntent(intent) === null) {
    throw new Error("Adjust plan intent is invalid.");
  }
  return intent;
}

export function readAdjustPlanIntent(
  input: unknown,
): AdjustPlanIntentV1 | null {
  if (!isRecord(input)) return null;
  if (input.schemaVersion !== ADJUST_PLAN_INTENT_SCHEMA_VERSION) return null;
  if (input.type !== "open-adjust-plan") return null;

  const requestedAt = readRequestedAt(input.requestedAt);
  if (requestedAt === null) return null;

  return {
    schemaVersion: ADJUST_PLAN_INTENT_SCHEMA_VERSION,
    type: "open-adjust-plan",
    requestedAt,
  };
}

export function createRecipeImportIntent({
  clientRequestId,
  source,
  now,
}: {
  clientRequestId: string;
  source: RecipeImportIntentV1["source"];
  now: number;
}): RecipeImportIntentV1 {
  const intent = {
    schemaVersion: RECIPE_IMPORT_INTENT_SCHEMA_VERSION,
    type: "import-recipe",
    clientRequestId,
    source,
    requestedAt: now,
  } as const;
  const prepared = readRecipeImportIntent(intent);
  if (prepared === null) throw new Error("Recipe import intent is invalid.");
  return prepared;
}

export function readRecipeImportIntent(
  input: unknown,
): RecipeImportIntentV1 | null {
  if (!isRecord(input)) return null;
  if (input.schemaVersion !== RECIPE_IMPORT_INTENT_SCHEMA_VERSION) return null;
  if (input.type !== "import-recipe") return null;
  if (
    typeof input.clientRequestId !== "string" ||
    input.clientRequestId.trim().length === 0 ||
    input.clientRequestId.length >
      RECIPE_IMPORT_INPUT_LIMITS.requestIdCharacters
  ) {
    return null;
  }
  if (!isRecord(input.source)) return null;

  let source: RecipeImportIntentV1["source"];
  if (
    input.source.type === "url" &&
    typeof input.source.url === "string" &&
    input.source.url.trim().length > 0 &&
    input.source.url.length <= RECIPE_IMPORT_INPUT_LIMITS.urlCharacters
  ) {
    source = { type: "url", url: input.source.url.trim() };
  } else if (
    input.source.type === "text" &&
    typeof input.source.text === "string" &&
    input.source.text.trim().length >=
      RECIPE_IMPORT_INPUT_LIMITS.minimumTextCharacters &&
    input.source.text.length <= RECIPE_IMPORT_INPUT_LIMITS.textCharacters
  ) {
    source = { type: "text", text: input.source.text.trim() };
  } else {
    return null;
  }

  const requestedAt = readRequestedAt(input.requestedAt);
  if (requestedAt === null) return null;
  return {
    schemaVersion: RECIPE_IMPORT_INTENT_SCHEMA_VERSION,
    type: "import-recipe",
    clientRequestId: input.clientRequestId,
    source,
    requestedAt,
  };
}

function readRequestedAt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    return null;
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
