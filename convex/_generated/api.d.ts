/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as catalogue from "../catalogue.js";
import type * as catalogueAdmin from "../catalogueAdmin.js";
import type * as catalogueGenerationActions from "../catalogueGenerationActions.js";
import type * as catalogueMaintenance from "../catalogueMaintenance.js";
import type * as catalogueMigration from "../catalogueMigration.js";
import type * as crons from "../crons.js";
import type * as households from "../households.js";
import type * as http from "../http.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_catalogue from "../lib/catalogue.js";
import type * as lib_catalogueGeneration_catalogue from "../lib/catalogueGeneration/catalogue.js";
import type * as lib_catalogueGeneration_config from "../lib/catalogueGeneration/config.js";
import type * as lib_catalogueGeneration_errors from "../lib/catalogueGeneration/errors.js";
import type * as lib_catalogueGeneration_models from "../lib/catalogueGeneration/models.js";
import type * as lib_catalogueGeneration_pipeline from "../lib/catalogueGeneration/pipeline.js";
import type * as lib_catalogueGeneration_prompts from "../lib/catalogueGeneration/prompts.js";
import type * as lib_catalogueGeneration_revisions from "../lib/catalogueGeneration/revisions.js";
import type * as lib_catalogueGeneration_validators from "../lib/catalogueGeneration/validators.js";
import type * as lib_catalogueRecipes from "../lib/catalogueRecipes.js";
import type * as lib_planningPreferences from "../lib/planningPreferences.js";
import type * as lib_recipeImport_contracts from "../lib/recipeImport/contracts.js";
import type * as lib_recipeImport_corrections from "../lib/recipeImport/corrections.js";
import type * as lib_recipeImport_extraction from "../lib/recipeImport/extraction.js";
import type * as lib_recipeImport_images from "../lib/recipeImport/images.js";
import type * as lib_recipeImport_measurements from "../lib/recipeImport/measurements.js";
import type * as lib_recipeImport_models from "../lib/recipeImport/models.js";
import type * as lib_recipeImport_network from "../lib/recipeImport/network.js";
import type * as lib_recipeImport_pipeline from "../lib/recipeImport/pipeline.js";
import type * as lib_recipeImport_prompts from "../lib/recipeImport/prompts.js";
import type * as lib_recipeImport_source from "../lib/recipeImport/source.js";
import type * as lib_recipeImport_sourceImages from "../lib/recipeImport/sourceImages.js";
import type * as lib_recipeImport_sources from "../lib/recipeImport/sources.js";
import type * as lib_recipeImport_validation from "../lib/recipeImport/validation.js";
import type * as lib_recipeValidators from "../lib/recipeValidators.js";
import type * as lib_shoppingListSync from "../lib/shoppingListSync.js";
import type * as lib_spaces from "../lib/spaces.js";
import type * as mealPlans from "../mealPlans.js";
import type * as planningPreferences from "../planningPreferences.js";
import type * as recipeImportActions from "../recipeImportActions.js";
import type * as recipeImports from "../recipeImports.js";
import type * as recipes from "../recipes.js";
import type * as shoppingLists from "../shoppingLists.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  catalogue: typeof catalogue;
  catalogueAdmin: typeof catalogueAdmin;
  catalogueGenerationActions: typeof catalogueGenerationActions;
  catalogueMaintenance: typeof catalogueMaintenance;
  catalogueMigration: typeof catalogueMigration;
  crons: typeof crons;
  households: typeof households;
  http: typeof http;
  "lib/auth": typeof lib_auth;
  "lib/catalogue": typeof lib_catalogue;
  "lib/catalogueGeneration/catalogue": typeof lib_catalogueGeneration_catalogue;
  "lib/catalogueGeneration/config": typeof lib_catalogueGeneration_config;
  "lib/catalogueGeneration/errors": typeof lib_catalogueGeneration_errors;
  "lib/catalogueGeneration/models": typeof lib_catalogueGeneration_models;
  "lib/catalogueGeneration/pipeline": typeof lib_catalogueGeneration_pipeline;
  "lib/catalogueGeneration/prompts": typeof lib_catalogueGeneration_prompts;
  "lib/catalogueGeneration/revisions": typeof lib_catalogueGeneration_revisions;
  "lib/catalogueGeneration/validators": typeof lib_catalogueGeneration_validators;
  "lib/catalogueRecipes": typeof lib_catalogueRecipes;
  "lib/planningPreferences": typeof lib_planningPreferences;
  "lib/recipeImport/contracts": typeof lib_recipeImport_contracts;
  "lib/recipeImport/corrections": typeof lib_recipeImport_corrections;
  "lib/recipeImport/extraction": typeof lib_recipeImport_extraction;
  "lib/recipeImport/images": typeof lib_recipeImport_images;
  "lib/recipeImport/measurements": typeof lib_recipeImport_measurements;
  "lib/recipeImport/models": typeof lib_recipeImport_models;
  "lib/recipeImport/network": typeof lib_recipeImport_network;
  "lib/recipeImport/pipeline": typeof lib_recipeImport_pipeline;
  "lib/recipeImport/prompts": typeof lib_recipeImport_prompts;
  "lib/recipeImport/source": typeof lib_recipeImport_source;
  "lib/recipeImport/sourceImages": typeof lib_recipeImport_sourceImages;
  "lib/recipeImport/sources": typeof lib_recipeImport_sources;
  "lib/recipeImport/validation": typeof lib_recipeImport_validation;
  "lib/recipeValidators": typeof lib_recipeValidators;
  "lib/shoppingListSync": typeof lib_shoppingListSync;
  "lib/spaces": typeof lib_spaces;
  mealPlans: typeof mealPlans;
  planningPreferences: typeof planningPreferences;
  recipeImportActions: typeof recipeImportActions;
  recipeImports: typeof recipeImports;
  recipes: typeof recipes;
  shoppingLists: typeof shoppingLists;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
