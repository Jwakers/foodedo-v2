import type { OptimisticLocalStore } from "convex/browser";
import type { Id } from "../../../convex/_generated/dataModel";
import { api } from "../../../convex/_generated/api";
import type { ShoppingItem } from "./shopping-list-types";

export const optimisticRemovedAt = Number.MAX_SAFE_INTEGER;

export function optimisticallyUpdateShoppingItem(
  localStore: OptimisticLocalStore,
  itemId: Id<"shoppingListItems">,
  updateItem: (item: ShoppingItem) => ShoppingItem,
) {
  const progressByListId = new Map<
    Id<"shoppingLists">,
    { itemCount: number; checkedCount: number }
  >();

  function updateList<
    List extends { _id: Id<"shoppingLists">; items: ShoppingItem[] },
  >(list: List): List | null {
    const itemIndex = list.items.findIndex((item) => item._id === itemId);
    if (itemIndex === -1) return null;

    const items = list.items.map((item, index) =>
      index === itemIndex ? updateItem(item) : item,
    );
    const activeItems = items.filter(
      (item) => item.deletedAt === null && item.included,
    );
    progressByListId.set(list._id, {
      itemCount: activeItems.length,
      checkedCount: activeItems.filter((item) => item.checked).length,
    });
    return { ...list, items };
  }

  for (const { args, value } of localStore.getAllQueries(
    api.shoppingLists.getCurrent,
  )) {
    if (value?.status !== "ready" || value.list === null) continue;
    const list = updateList(value.list);
    if (list !== null) {
      localStore.setQuery(api.shoppingLists.getCurrent, args, {
        ...value,
        list,
      });
    }
  }

  for (const { args, value } of localStore.getAllQueries(
    api.shoppingLists.getById,
  )) {
    if (value === undefined || value === null) continue;
    const list = updateList(value);
    if (list !== null) {
      localStore.setQuery(api.shoppingLists.getById, args, list);
    }
  }

  if (progressByListId.size === 0) return;
  for (const { args, value } of localStore.getAllQueries(
    api.shoppingLists.getRecentSummaries,
  )) {
    if (value === undefined) continue;
    let changed = false;
    const summaries = value.map((summary) => {
      const progress = progressByListId.get(summary._id);
      if (progress === undefined) return summary;
      changed = true;
      return { ...summary, ...progress };
    });
    if (changed) {
      localStore.setQuery(
        api.shoppingLists.getRecentSummaries,
        args,
        summaries,
      );
    }
  }
}
