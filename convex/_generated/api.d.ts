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
import type * as crons from "../crons.js";
import type * as http from "../http.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_catalogue from "../lib/catalogue.js";
import type * as lib_catalogueRecipes from "../lib/catalogueRecipes.js";
import type * as lib_planningPreferences from "../lib/planningPreferences.js";
import type * as lib_recipeValidators from "../lib/recipeValidators.js";
import type * as lib_shoppingListSync from "../lib/shoppingListSync.js";
import type * as mealPlans from "../mealPlans.js";
import type * as planningPreferences from "../planningPreferences.js";
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
  crons: typeof crons;
  http: typeof http;
  "lib/auth": typeof lib_auth;
  "lib/catalogue": typeof lib_catalogue;
  "lib/catalogueRecipes": typeof lib_catalogueRecipes;
  "lib/planningPreferences": typeof lib_planningPreferences;
  "lib/recipeValidators": typeof lib_recipeValidators;
  "lib/shoppingListSync": typeof lib_shoppingListSync;
  mealPlans: typeof mealPlans;
  planningPreferences: typeof planningPreferences;
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
