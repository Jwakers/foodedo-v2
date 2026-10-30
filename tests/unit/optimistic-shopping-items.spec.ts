import { expect, test } from "@playwright/test";
import type { OptimisticLocalStore } from "convex/browser";
import {
  getFunctionName,
  type FunctionReference,
  type FunctionArgs,
  type FunctionReturnType,
} from "convex/server";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  optimisticallyUpdateShoppingItem,
  optimisticRemovedAt,
} from "../../src/features/shop/optimistic-shopping-items";
import type {
  ReadyShoppingList,
  ShoppingItem,
} from "../../src/features/shop/shopping-list-types";

function setup() {
  const rows: Array<{ name: string; args: unknown; value: unknown }> = [];
  const store: OptimisticLocalStore = {
    getQuery: () => undefined,
    getAllQueries<Query extends FunctionReference<"query">>(query: Query) {
      return rows
        .filter((row) => row.name === getFunctionName(query))
        .map((row) => ({
          args: row.args as FunctionArgs<Query>,
          value: row.value as FunctionReturnType<Query>,
        }));
    },
    setQuery(query, args, value) {
      const name = getFunctionName(query);
      const row = rows.find(
        (row) =>
          row.name === name &&
          JSON.stringify(row.args) === JSON.stringify(args),
      );
      if (row) row.value = value;
      else rows.push({ name, args, value });
    },
  };
  const item: ShoppingItem = {
    _id: "item" as Id<"shoppingListItems">,
    name: "pasta",
    displayName: "Pasta",
    category: "pantry",
    detailLines: [],
    sources: [],
    origin: "derived",
    treatment: "required",
    included: true,
    checked: false,
    deletedAt: null,
    order: 0,
  };
  const current: ReadyShoppingList = {
    status: "ready",
    currentMealPlanId: "plan" as Id<"mealPlans">,
    startDate: "2030-01-01",
    endDate: "2030-01-03",
    mealCount: 1,
    list: {
      _id: "list" as Id<"shoppingLists">,
      mealPlanId: "plan" as Id<"mealPlans">,
      startDate: "2030-01-01",
      endDate: "2030-01-03",
      mealCount: 1,
      needsSync: false,
      items: [item],
    },
  };
  store.setQuery(api.shoppingLists.getCurrent, {}, current);
  store.setQuery(
    api.shoppingLists.getById,
    { shoppingListId: current.list!._id },
    { ...current.list!, status: "active" },
  );
  store.setQuery(api.shoppingLists.getRecentSummaries, {}, [
    {
      _id: current.list!._id,
      startDate: current.startDate,
      endDate: current.endDate,
      status: "active",
      itemCount: 1,
      checkedCount: 0,
      mealCount: 1,
      createdAt: 1,
    },
  ]);
  function read<Query extends FunctionReference<"query">>(query: Query) {
    return store.getAllQueries(query)[0].value!;
  }
  return { store, item, current, read };
}

test("optimistic checks, removals and restores keep both list caches and history counts consistent", () => {
  const { store, item, current, read } = setup();
  const before = structuredClone(current);
  optimisticallyUpdateShoppingItem(store, item._id, (item) => ({
    ...item,
    checked: true,
  }));
  expect(read(api.shoppingLists.getById)?.items[0].checked).toBe(true);
  expect(read(api.shoppingLists.getRecentSummaries)[0].checkedCount).toBe(1);
  optimisticallyUpdateShoppingItem(store, item._id, (item) => ({
    ...item,
    deletedAt: optimisticRemovedAt,
  }));
  expect(read(api.shoppingLists.getRecentSummaries)[0]).toMatchObject({
    itemCount: 0,
    checkedCount: 0,
  });
  optimisticallyUpdateShoppingItem(store, item._id, (item) => ({
    ...item,
    deletedAt: null,
  }));
  expect(read(api.shoppingLists.getRecentSummaries)[0]).toMatchObject({
    itemCount: 1,
    checkedCount: 1,
  });
  expect(read(api.shoppingLists.getCurrent)).toMatchObject({
    list: { items: [{ checked: true, deletedAt: null }] },
  });
  expect(current).toEqual(before); // Server-derived inputs were not mutated.
});

test("excluding a staple removes it from progress without marking it purchased", () => {
  const { store, item, read } = setup();
  optimisticallyUpdateShoppingItem(store, item._id, (item) => ({
    ...item,
    treatment: "staple",
    included: false,
    checked: false,
  }));
  expect(read(api.shoppingLists.getRecentSummaries)[0]).toMatchObject({
    itemCount: 0,
    checkedCount: 0,
  });
  expect(read(api.shoppingLists.getById)?.items[0]).toMatchObject({
    included: false,
    checked: false,
    deletedAt: null,
  });
});
