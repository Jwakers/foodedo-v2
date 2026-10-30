import type { FunctionReturnType } from "convex/server";
import type { api } from "../../../convex/_generated/api";

export type CurrentShoppingList = FunctionReturnType<
  typeof api.shoppingLists.getCurrent
>;

export type ReadyShoppingList = Extract<
  CurrentShoppingList,
  { status: "ready" }
>;

export type ShoppingItem = NonNullable<
  ReadyShoppingList["list"]
>["items"][number];

export type ShoppingListSummary = FunctionReturnType<
  typeof api.shoppingLists.getRecentSummaries
>[number];

export type SelectedShoppingList = NonNullable<
  FunctionReturnType<typeof api.shoppingLists.getById>
>;
