"use client";

import { useAuth } from "@clerk/react";
import type { OptimisticLocalStore } from "convex/browser";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  Info,
  ShoppingBasket,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { AccountConnectionError } from "@/components/account-connection-error";
import { Button, ButtonLink } from "@/components/ui/button";
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { formatPlanDateRange } from "@/lib/domain/plan-display";
import { SHOPPING_CATEGORIES } from "@/lib/domain/recipes";
import type { ShoppingListCategory } from "@/lib/domain/shopping-list";
import { cn } from "@/lib/utils/cn";

type CurrentShoppingList = FunctionReturnType<
  typeof api.shoppingLists.getCurrent
>;
type ReadyShoppingList = Extract<CurrentShoppingList, { status: "ready" }>;
type ShoppingItem = NonNullable<ReadyShoppingList["list"]>["items"][number];
type ShoppingListSummary = FunctionReturnType<
  typeof api.shoppingLists.getRecentSummaries
>[number];
type SelectedShoppingList = NonNullable<
  FunctionReturnType<typeof api.shoppingLists.getById>
>;

const categoryOrder: ShoppingListCategory[] = [...SHOPPING_CATEGORIES];

const categoryLabels: Record<ShoppingListCategory, string> = {
  fruit_and_veg: "Fruit & veg",
  meat_and_fish: "Meat & fish",
  dairy_and_eggs: "Dairy & eggs",
  pantry: "Pantry",
  bakery: "Bakery",
  other: "Other",
};

const optimisticRemovedAt = Number.MAX_SAFE_INTEGER;

function optimisticallyUpdateShoppingItem(
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
    const activeItems = items.filter((item) => item.deletedAt === null);
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

export function ShoppingListPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isLoaded, isSignedIn } = useAuth();
  const { isAuthenticated, isLoading: isConvexAuthLoading } = useConvexAuth();
  const current = useQuery(
    api.shoppingLists.getCurrent,
    isAuthenticated ? {} : "skip",
  );
  const recentLists = useQuery(
    api.shoppingLists.getRecentSummaries,
    isAuthenticated ? {} : "skip",
  );
  const requestedListId = searchParams.get("list");
  const requestedList = recentLists?.find(
    (list) => list._id === requestedListId,
  );
  const currentListId = current?.status === "ready" ? current.list?._id : null;
  const selectedList = useQuery(
    api.shoppingLists.getById,
    isAuthenticated &&
      requestedList !== undefined &&
      requestedList._id !== currentListId
      ? { shoppingListId: requestedList._id }
      : "skip",
  );

  useEffect(() => {
    if (
      recentLists === undefined ||
      requestedListId === null ||
      requestedList !== undefined
    ) {
      return;
    }
    router.replace(pathname, { scroll: false });
  }, [pathname, recentLists, requestedList, requestedListId, router]);

  if (
    !isLoaded ||
    (isSignedIn && isConvexAuthLoading) ||
    (isAuthenticated && (current === undefined || recentLists === undefined))
  ) {
    return <ShoppingListLoading />;
  }

  if (isSignedIn && !isAuthenticated) {
    return <AccountConnectionError />;
  }

  if (!isAuthenticated) {
    return <NoActivePlan />;
  }

  if (current === undefined) {
    return <ShoppingListLoading />;
  }

  if (current.status === "active_plan_conflict") {
    return <ShoppingListUnavailable />;
  }

  const hasHistoricalLists = (recentLists?.length ?? 0) > 0;
  if (current.status === "no_active_plan" && !hasHistoricalLists) {
    return <NoActivePlan />;
  }

  function selectList(shoppingListId: Id<"shoppingLists"> | null) {
    const nextParams = new URLSearchParams(searchParams.toString());
    if (shoppingListId === null || shoppingListId === currentListId) {
      nextParams.delete("list");
    } else {
      nextParams.set("list", shoppingListId);
    }
    const query = nextParams.toString();
    router.push(query === "" ? pathname : `${pathname}?${query}`, {
      scroll: false,
    });
  }

  if (
    requestedList !== undefined &&
    requestedList._id !== currentListId &&
    selectedList === undefined
  ) {
    return <ShoppingListLoading message="Loading that shopping list…" />;
  }

  return (
    <ReadyShoppingListPage
      current={current.status === "ready" ? current : null}
      recentLists={recentLists ?? []}
      selectedList={selectedList ?? null}
      onSelectList={selectList}
    />
  );
}

export function ShoppingListPageFallback() {
  return <ShoppingListLoading />;
}

function ReadyShoppingListPage({
  current,
  recentLists,
  selectedList,
  onSelectList,
}: {
  current: ReadyShoppingList | null;
  recentLists: ShoppingListSummary[];
  selectedList: SelectedShoppingList | null;
  onSelectList: (shoppingListId: Id<"shoppingLists"> | null) => void;
}) {
  const ensureList = useMutation(api.shoppingLists.ensureForCurrentPlan);
  const setItemCheckedMutation = useMutation(api.shoppingLists.setItemChecked);
  const removeItemMutation = useMutation(api.shoppingLists.removeItem);
  const restoreItemMutation = useMutation(api.shoppingLists.restoreItem);
  const setItemChecked = useMemo(
    () =>
      setItemCheckedMutation.withOptimisticUpdate(
        (localStore, { itemId, checked }) => {
          optimisticallyUpdateShoppingItem(localStore, itemId, (item) => ({
            ...item,
            checked,
          }));
        },
      ),
    [setItemCheckedMutation],
  );
  const removeItem = useMemo(
    () =>
      removeItemMutation.withOptimisticUpdate((localStore, { itemId }) => {
        optimisticallyUpdateShoppingItem(localStore, itemId, (item) => ({
          ...item,
          deletedAt: optimisticRemovedAt,
        }));
      }),
    [removeItemMutation],
  );
  const restoreItem = useMemo(
    () =>
      restoreItemMutation.withOptimisticUpdate((localStore, { itemId }) => {
        optimisticallyUpdateShoppingItem(localStore, itemId, (item) => ({
          ...item,
          deletedAt: null,
        }));
      }),
    [restoreItemMutation],
  );
  const attemptedSync = useRef(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncAttempt, setSyncAttempt] = useState(0);
  const [hideChecked, setHideChecked] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selectedItemId, setSelectedItemId] =
    useState<Id<"shoppingListItems"> | null>(null);
  const currentList = current?.list ?? null;
  const list = selectedList ?? currentList;
  const needsSync =
    current !== null && (current.list === null || current.list.needsSync);

  useEffect(() => {
    if (!needsSync || attemptedSync.current) return;
    attemptedSync.current = true;
    setIsSyncing(true);
    void ensureList({})
      .then((result) => {
        if (result.status !== "ready") {
          setSyncError(syncErrorMessage(result.status));
        }
      })
      .catch((error: unknown) => {
        console.error("Failed to synchronize the shopping list.", error);
        setSyncError("Foodedo couldn’t prepare your list. Try again.");
      })
      .finally(() => setIsSyncing(false));
  }, [ensureList, needsSync, syncAttempt]);

  if (current !== null && (needsSync || current.list === null)) {
    return (
      <ShoppingListLoading
        message={syncError ?? "Preparing this plan’s shopping list…"}
        action={
          syncError ? (
            <Button
              className="mt-5"
              disabled={isSyncing}
              onClick={() => {
                attemptedSync.current = false;
                setSyncError(null);
                setSyncAttempt((attempt) => attempt + 1);
              }}
            >
              Try again
            </Button>
          ) : null
        }
      />
    );
  }

  if (list === null) {
    return (
      <HistoricalListPicker
        recentLists={recentLists}
        onOpenHistory={() => setHistoryOpen(true)}
        historyOpen={historyOpen}
        onHistoryOpenChange={setHistoryOpen}
        onSelectList={(shoppingListId) => {
          setHistoryOpen(false);
          onSelectList(shoppingListId);
        }}
      />
    );
  }

  const isPreviousList = selectedList !== null || currentList === null;
  const listStartDate = list.startDate;
  const listEndDate = list.endDate;
  const listMealCount = list.mealCount;
  const items = list.items;

  const activeItems = items.filter((item) => item.deletedAt === null);
  const removedItems = items
    .filter((item) => item.deletedAt !== null)
    .toSorted((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0));
  const checkedCount = activeItems.filter((item) => item.checked).length;
  const isComplete =
    activeItems.length > 0 && checkedCount === activeItems.length;
  const visibleItems = hideChecked
    ? activeItems.filter((item) => !item.checked)
    : activeItems;
  const selectedItem =
    items.find((item) => item._id === selectedItemId) ?? null;

  async function handleCheckedChange(item: ShoppingItem, checked: boolean) {
    try {
      const result = await setItemChecked({ itemId: item._id, checked });
      if (result.status !== "updated") throw new Error("Item is unavailable");
    } catch (error) {
      console.error("Failed to update a shopping item.", error);
      toast.error("That item didn’t update. Try again.");
    }
  }

  async function handleRemoveItem(item: ShoppingItem) {
    setSelectedItemId(null);
    try {
      const result = await removeItem({ itemId: item._id });
      if (result.status !== "updated") throw new Error("Item is unavailable");
    } catch (error) {
      console.error("Failed to remove a shopping item.", error);
      toast.error("That item couldn’t be removed. Try again.");
    }
  }

  async function handleRestoreItem(item: ShoppingItem) {
    try {
      const result = await restoreItem({ itemId: item._id });
      if (result.status !== "updated") throw new Error("Item is unavailable");
    } catch (error) {
      console.error("Failed to restore a shopping item.", error);
      toast.error("That item couldn’t be restored. Try again.");
    }
  }

  return (
    <>
      <main
        aria-labelledby="shopping-heading"
        className="mx-auto flex w-full max-w-175 flex-col px-page-inline pt-5 pb-8"
      >
        <ShoppingListIntro
          startDate={listStartDate}
          endDate={listEndDate}
          mealCount={listMealCount}
          itemCount={activeItems.length}
          checkedCount={checkedCount}
          hideChecked={hideChecked}
          isComplete={isComplete}
          isPreviousList={isPreviousList}
          hasHistory={recentLists.length > 1 || currentList === null}
          showReturnToCurrent={currentList !== null && isPreviousList}
          onOpenHistory={() => setHistoryOpen(true)}
          onReturnToCurrent={() => onSelectList(null)}
          onToggleCheckedVisibility={() => setHideChecked((hidden) => !hidden)}
        />

        <div aria-live="polite" className="sr-only">
          {checkedCount} of {activeItems.length} items picked up.
        </div>

        {categoryOrder.map((category) => {
          const categoryItems = visibleItems.filter(
            (item) => item.category === category,
          );
          if (categoryItems.length === 0) return null;
          return (
            <ShoppingCategory
              key={category}
              category={category}
              items={categoryItems}
              onCheckedChange={handleCheckedChange}
              onOpenItem={setSelectedItemId}
            />
          );
        })}

        {removedItems.length > 0 ? (
          <RemovedItemsSection
            items={removedItems}
            onRestoreItem={handleRestoreItem}
          />
        ) : null}
      </main>

      <IngredientSourcesDrawer
        item={selectedItem}
        open={selectedItem !== null && selectedItem.deletedAt === null}
        onOpenChange={(open) => {
          if (!open) setSelectedItemId(null);
        }}
        onRemoveItem={handleRemoveItem}
      />
      <ShoppingListHistoryDrawer
        open={historyOpen}
        lists={recentLists}
        selectedListId={list._id}
        onOpenChange={setHistoryOpen}
        onSelect={(shoppingListId) => {
          setHistoryOpen(false);
          setHideChecked(false);
          onSelectList(
            currentList !== null && shoppingListId === currentList._id
              ? null
              : shoppingListId,
          );
        }}
      />
    </>
  );
}

function ShoppingListIntro({
  startDate,
  endDate,
  mealCount,
  itemCount,
  checkedCount,
  hideChecked,
  isComplete,
  isPreviousList,
  hasHistory,
  showReturnToCurrent,
  onOpenHistory,
  onReturnToCurrent,
  onToggleCheckedVisibility,
}: {
  startDate: string;
  endDate: string;
  mealCount: number;
  itemCount: number;
  checkedCount: number;
  hideChecked: boolean;
  isComplete: boolean;
  isPreviousList: boolean;
  hasHistory: boolean;
  showReturnToCurrent: boolean;
  onOpenHistory: () => void;
  onReturnToCurrent: () => void;
  onToggleCheckedVisibility: () => void;
}) {
  const progress = itemCount === 0 ? 0 : (checkedCount / itemCount) * 100;
  return (
    <section className="flex flex-col gap-2 pb-5 pt-2">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1
            id="shopping-heading"
            className="font-display text-32 font-bold tracking-title text-ink"
          >
            Shopping
          </h1>
          {hasHistory ? (
            <button
              type="button"
              className="mt-0.5 -ml-2 flex min-h-11 items-center gap-1 rounded-sm px-2 text-14 font-medium text-graphite focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cadmium"
              aria-label="Choose a recent shopping list"
              onClick={onOpenHistory}
            >
              {isPreviousList ? "Previous list" : "This week"} ·{" "}
              {formatPlanDateRange({ startDate, endDate })}
              <ChevronDown aria-hidden="true" className="size-4" />
            </button>
          ) : (
            <p className="mt-1 text-14 text-graphite">
              This week · {formatPlanDateRange({ startDate, endDate })}
            </p>
          )}
        </div>
        {showReturnToCurrent ? (
          <button
            type="button"
            className="flex min-h-11 shrink-0 items-center pl-3 text-13 font-semibold text-leaf focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cadmium"
            onClick={onReturnToCurrent}
          >
            Current list
          </button>
        ) : (
          <Link
            href="/week"
            className="flex min-h-11 shrink-0 items-center gap-1.5 pl-3 text-13 font-semibold text-leaf focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cadmium"
          >
            View week <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        )}
      </div>
      <div className="flex min-h-5 items-center justify-between gap-3 text-14">
        {hideChecked && checkedCount > 0 ? (
          <button
            type="button"
            className="min-h-11 -my-3 font-semibold text-leaf focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cadmium"
            onClick={onToggleCheckedVisibility}
          >
            Show checked ({checkedCount})
          </button>
        ) : isComplete ? (
          <span className="font-semibold text-leaf">
            Everything’s picked up
          </span>
        ) : checkedCount > 0 ? (
          <button
            type="button"
            className="min-h-11 -my-3 font-semibold text-leaf focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cadmium"
            onClick={onToggleCheckedVisibility}
          >
            Hide checked
          </button>
        ) : (
          <span className="font-medium text-ink">
            {itemCount} items · {mealCount} meals
          </span>
        )}
        <span className="shrink-0 text-graphite">
          {isComplete
            ? `${itemCount} of ${itemCount} items`
            : `${checkedCount} of ${itemCount} picked up`}
        </span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-mist">
        <div
          className="h-full rounded-full bg-leaf transition-[width] motion-reduce:transition-none"
          style={{ width: `${progress}%` }}
        />
      </div>
    </section>
  );
}

function ShoppingCategory({
  category,
  items,
  onCheckedChange,
  onOpenItem,
}: {
  category: ShoppingListCategory;
  items: ShoppingItem[];
  onCheckedChange: (
    item: ShoppingItem,
    checked: boolean,
  ) => void | Promise<void>;
  onOpenItem: (itemId: Id<"shoppingListItems">) => void;
}) {
  return (
    <section aria-labelledby={`shopping-${category}`} className="pt-2.5 pb-1">
      <h2
        id={`shopping-${category}`}
        className="flex h-7 items-center text-12 font-bold tracking-label text-leaf uppercase"
      >
        {categoryLabels[category]}
      </h2>
      <ul>
        {items.map((item) => (
          <li key={item._id} className="flex h-14 border-b border-border">
            <label className="flex h-14 min-w-0 flex-1 cursor-pointer items-center text-left">
              <input
                type="checkbox"
                checked={item.checked}
                className="peer sr-only"
                onChange={(event) =>
                  void onCheckedChange(item, event.currentTarget.checked)
                }
              />
              <span className="flex h-14 w-12.5 shrink-0 items-center peer-focus-visible:outline-2 peer-focus-visible:-outline-offset-2 peer-focus-visible:outline-cadmium">
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex size-7 items-center justify-center rounded-full border-[1.5px] transition-colors",
                    item.checked
                      ? "border-leaf bg-leaf text-paper"
                      : "border-control-muted bg-paper text-transparent",
                  )}
                >
                  <Check className="size-4" strokeWidth={2} />
                </span>
              </span>
              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-16 font-medium text-ink",
                  item.checked && "text-graphite line-through",
                )}
              >
                {item.displayName}
              </span>
            </label>
            <Button
              type="button"
              variant="ghost"
              size="rowIcon"
              aria-label={`View details for ${item.displayName}`}
              className="justify-end focus-visible:-outline-offset-2"
              onClick={() => onOpenItem(item._id)}
            >
              <ChevronRight aria-hidden="true" className="size-4" />
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function RemovedItemsSection({
  items,
  onRestoreItem,
}: {
  items: ShoppingItem[];
  onRestoreItem: (item: ShoppingItem) => void | Promise<void>;
}) {
  return (
    <section aria-labelledby="shopping-removed" className="pt-6 pb-1">
      <h2
        id="shopping-removed"
        className="flex h-7 items-center text-12 font-bold tracking-label text-graphite uppercase"
      >
        Removed items
      </h2>
      <ul>
        {items.map((item) => (
          <li
            key={item._id}
            className="flex h-14 items-center border-b border-border"
          >
            <span className="min-w-0 flex-1 truncate text-16 font-medium text-graphite line-through">
              {item.displayName}
            </span>
            <button
              type="button"
              className="flex h-14 shrink-0 items-center pl-3 text-13 font-semibold text-leaf focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-cadmium"
              onClick={() => void onRestoreItem(item)}
            >
              Restore
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function HistoricalListPicker({
  recentLists,
  historyOpen,
  onOpenHistory,
  onHistoryOpenChange,
  onSelectList,
}: {
  recentLists: ShoppingListSummary[];
  historyOpen: boolean;
  onOpenHistory: () => void;
  onHistoryOpenChange: (open: boolean) => void;
  onSelectList: (shoppingListId: Id<"shoppingLists">) => void;
}) {
  return (
    <>
      <main
        aria-labelledby="shopping-heading"
        className="mx-auto flex min-h-[calc(100dvh-var(--app-header-height)-var(--app-nav-height))] w-full max-w-175 flex-col px-page-inline pt-5 pb-8"
      >
        <h1
          id="shopping-heading"
          className="font-display text-32 font-bold tracking-title text-ink"
        >
          Shopping
        </h1>
        <p className="mt-1 text-14 text-graphite">
          No active plan right now. Open a previous list to keep shopping.
        </p>
        <div className="flex flex-1 flex-col items-center justify-center pb-12 text-center">
          <Button className="mt-7 w-full" onClick={onOpenHistory}>
            Choose a previous list
          </Button>
          <ButtonLink href="/week" variant="secondary" className="mt-3 w-full">
            Plan my week
          </ButtonLink>
        </div>
      </main>
      <ShoppingListHistoryDrawer
        open={historyOpen}
        lists={recentLists}
        selectedListId={null}
        onOpenChange={onHistoryOpenChange}
        onSelect={onSelectList}
      />
    </>
  );
}

function ShoppingListHistoryDrawer({
  open,
  lists,
  selectedListId,
  onOpenChange,
  onSelect,
}: {
  open: boolean;
  lists: ShoppingListSummary[];
  selectedListId: Id<"shoppingLists"> | null;
  onOpenChange: (open: boolean) => void;
  onSelect: (shoppingListId: Id<"shoppingLists">) => void;
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[min(85dvh,38rem)]">
        <DrawerHeader className="flex-col items-stretch gap-1 pt-1 pb-4">
          <DrawerTitle>Recent shopping lists</DrawerTitle>
          <DrawerDescription>
            Pick up where you left off. Recent lists stay editable.
          </DrawerDescription>
        </DrawerHeader>
        <DrawerBody className="px-0 pb-[max(20px,env(safe-area-inset-bottom))]">
          <ul className="border-t border-border">
            {lists.map((list) => {
              const isSelected = list._id === selectedListId;
              const progressLabel =
                list.itemCount === 0
                  ? "Empty"
                  : `${list.checkedCount} of ${list.itemCount} picked up`;
              return (
                <li key={list._id} className="border-b border-border">
                  <button
                    type="button"
                    className={cn(
                      "flex min-h-18 w-full items-center px-page-inline text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-cadmium",
                      isSelected && "bg-leaf-soft",
                    )}
                    aria-current={isSelected ? "true" : undefined}
                    onClick={() => onSelect(list._id)}
                  >
                    <span className="min-w-0 flex-1 pr-3">
                      <span className="block text-15 font-semibold text-ink">
                        {list.status === "active"
                          ? "Current list"
                          : "Previous list"}
                      </span>
                      <span className="mt-0.5 block text-13 text-graphite">
                        {formatPlanDateRange(list)} · {progressLabel}
                      </span>
                    </span>
                    <span className="flex w-6 shrink-0 justify-end text-leaf">
                      {isSelected ? (
                        <Check aria-hidden="true" className="size-5" />
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="px-page-inline pt-4 text-12 leading-relaxed text-graphite">
            Lists are kept for up to 30 days without activity.
          </p>
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}

function IngredientSourcesDrawer({
  item,
  open,
  onOpenChange,
  onRemoveItem,
}: {
  item: ShoppingItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRemoveItem: (item: ShoppingItem) => void | Promise<void>;
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[min(85dvh,34rem)]">
        {item ? (
          <>
            <DrawerHeader className="flex-col items-stretch gap-1.5 pt-1 pb-5">
              <p className="text-12 font-bold tracking-label text-leaf uppercase">
                Used for
              </p>
              <DrawerTitle className="text-32 font-bold">
                {item.displayName}
              </DrawerTitle>
              <DrawerDescription className="text-14">
                {item.sources.length === 1
                  ? "Used by 1 meal in this week’s plan."
                  : `Combined from ${item.sources.length} meals in this week’s plan.`}
              </DrawerDescription>
            </DrawerHeader>
            <DrawerBody className="pb-7">
              <ul className="border-t border-border">
                {item.sources.map((source, index) => (
                  <li
                    key={`${source.recipeId}:${source.date ?? index}`}
                    className="flex min-h-17 flex-col justify-center gap-0.5 border-b border-border py-2"
                  >
                    <p className="text-16 font-semibold text-ink">
                      {source.recipeTitle}
                    </p>
                    <p className="text-13 text-graphite">
                      {source.date ? `${formatWeekday(source.date)} · ` : ""}
                      {formatSourceAmount(source.amount, item.name)}
                    </p>
                  </li>
                ))}
              </ul>
              <Button
                variant="secondary"
                className="mt-5 w-full"
                onClick={() => void onRemoveItem(item)}
              >
                Remove from list
              </Button>
            </DrawerBody>
          </>
        ) : null}
      </DrawerContent>
    </Drawer>
  );
}

function NoActivePlan() {
  return (
    <main
      aria-labelledby="shopping-heading"
      className="mx-auto flex min-h-[calc(100dvh-var(--app-header-height)-var(--app-nav-height))] w-full max-w-175 flex-col px-page-inline pt-5 pb-8"
    >
      <h1
        id="shopping-heading"
        className="font-display text-32 font-bold tracking-title text-ink"
      >
        Shopping
      </h1>
      <p className="mt-1 text-14 text-graphite">
        Your list is created from your active meal plan.
      </p>
      <div className="flex flex-1 flex-col items-center justify-center pb-12 text-center">
        <div className="flex items-center gap-3 text-ink" aria-hidden="true">
          <span className="flex size-14 items-center justify-center rounded-compact bg-mist">
            <CalendarDays className="size-6" />
          </span>
          <ArrowRight className="size-5" />
          <span className="flex size-18 items-center justify-center rounded-full bg-leaf-soft text-leaf">
            <ShoppingBasket className="size-8" />
          </span>
        </div>
        <h2 className="mt-7 max-w-80 font-display text-24 font-bold tracking-title text-ink">
          Your shopping list starts with a plan
        </h2>
        <p className="mt-2 max-w-80 text-16 leading-relaxed text-graphite">
          Plan your meals and Foodedo will combine everything you need into one
          clean list.
        </p>
        <ButtonLink href="/week" className="mt-7 w-full">
          Plan my week <ArrowRight aria-hidden="true" className="size-4.5" />
        </ButtonLink>
        <p className="mt-4 flex max-w-76 items-start gap-2 text-left text-13 text-graphite">
          <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          Every saved meal plan keeps its own shopping list.
        </p>
      </div>
    </main>
  );
}

function ShoppingListLoading({
  message = "Loading your shopping list…",
  action = null,
}: {
  message?: string;
  action?: ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-175 px-page-inline pt-7" aria-busy>
      <div className="h-10 w-40 rounded-sm bg-mist" />
      <div className="mt-2 h-5 w-56 rounded-sm bg-mist" />
      <p className="mt-8 text-14 text-graphite">{message}</p>
      {action}
      <div className="mt-6 space-y-3">
        <div className="h-12 rounded-sm bg-mist" />
        <div className="h-12 rounded-sm bg-mist" />
        <div className="h-12 rounded-sm bg-mist" />
      </div>
    </main>
  );
}

function ShoppingListUnavailable() {
  return (
    <main className="mx-auto flex min-h-[45vh] w-full max-w-175 flex-col items-start justify-center px-page-inline py-10">
      <h1 className="font-display text-30 font-semibold tracking-title text-ink">
        Shopping is temporarily unavailable
      </h1>
      <p className="mt-2 text-15 text-graphite">
        Your account has conflicting active plans. Your saved data is unchanged.
      </p>
      <ButtonLink href="/week" className="mt-5">
        Review my week
      </ButtonLink>
    </main>
  );
}

function syncErrorMessage(status: string) {
  switch (status) {
    case "no_active_plan":
      return "Plan a week before creating a shopping list.";
    case "active_plan_conflict":
      return "Your account has conflicting active plans.";
    case "plan_unavailable":
      return "This week can’t be turned into a list yet.";
    default:
      return "Foodedo couldn’t prepare your list. Try again.";
  }
}

function formatWeekday(date: string) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

function formatSourceAmount(amount: string, itemName: string) {
  const match = amount.match(/^(\d+(?:\.\d+)?)\s*(whole|piece)$/i);
  if (!match) return amount === "" ? itemName : `${amount} ${itemName}`;
  const quantity = Number(match[1]);
  return `${match[1]} ${quantity === 1 ? itemName : pluralise(itemName)}`;
}

function pluralise(name: string) {
  if (name.endsWith("s") || name === "broccoli") return name;
  if (/[^aeiou]y$/i.test(name)) return `${name.slice(0, -1)}ies`;
  if (/(ch|sh|x|z)$/i.test(name)) return `${name}es`;
  return `${name}s`;
}
