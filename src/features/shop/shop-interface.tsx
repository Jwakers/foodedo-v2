"use client";

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import type { OptimisticLocalStore } from "convex/browser";
import type { FunctionReturnType } from "convex/server";
import {
  Check,
  ListChecks,
  Plus,
  RefreshCw,
  ShoppingBasket,
  Trash2,
  Undo2,
} from "lucide-react";
import Link from "next/link";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { buttonClassName } from "@/components/ui/button";
import { readGuestDraftV1 } from "@/lib/domain/guest-draft";
import {
  deriveShoppingListItems,
  prepareManualShoppingItemName,
  SHOPPING_LIST_LIMITS,
} from "@/lib/domain/shopping-list";
import { standardCatalogue } from "@/lib/domain/standard-catalogue";
import { createIndexedDbGuestDraftStore } from "@/lib/platform/guest-draft-store";
import { cn } from "@/lib/utils/cn";

const primaryButtonClassName = buttonClassName();
const secondaryButtonClassName = buttonClassName({ variant: "secondary" });

type CurrentShoppingState = FunctionReturnType<
  typeof api.shoppingLists.getCurrent
>;
type ReadyShoppingState = Extract<CurrentShoppingState, { status: "ready" }>;
const catalogueMealIds = standardCatalogue.meals.map((meal) => meal.id);
const catalogueMealById = new Map(
  standardCatalogue.meals.map((meal) => [meal.id, meal]),
);

export function ShopInterface() {
  const { isAuthenticated, isLoading: isAuthLoading } = useConvexAuth();
  const current = useQuery(
    api.shoppingLists.getCurrent,
    isAuthenticated ? {} : "skip",
  );

  if (isAuthLoading || (isAuthenticated && current === undefined)) {
    return <ShopLoading />;
  }

  if (!isAuthenticated) {
    return <GuestShoppingPreview />;
  }

  if (current?.status === "no_active_plan") {
    return (
      <ShopEmptyState
        title="A plan comes first."
        description="Start a meal plan and Foodedo will gather its ingredients here."
        actionLabel="Start a plan"
      />
    );
  }

  if (current?.status === "active_plan_conflict") {
    return (
      <ShopEmptyState
        title="Choose your current plan first."
        description="There is more than one active plan. Resolve that rare conflict on Plan before building a shopping list."
        actionLabel="Review plans"
      />
    );
  }

  if (current === undefined) return <ShopLoading />;
  return <AccountShoppingList current={current} />;
}

function GuestShoppingPreview() {
  const store = useMemo(() => createIndexedDbGuestDraftStore(), []);
  const [guestItems, setGuestItems] = useState<
    ReturnType<typeof deriveShoppingListItems> | null | undefined
  >(undefined);
  const [storageWarning, setStorageWarning] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void store
      .read()
      .then((stored) => {
        const draft = readGuestDraftV1(stored, {
          catalogueVersion: standardCatalogue.version,
          catalogueMealIds,
        });
        if (cancelled) return;
        if (draft === null) {
          setGuestItems(null);
          return;
        }

        const recipes = draft.mealChoices.flatMap((choice) => {
          const meal = catalogueMealById.get(choice.catalogueMealId);
          return meal === undefined
            ? []
            : [
                {
                  recipeId: meal.id,
                  title: meal.title,
                  ingredients: meal.ingredients,
                },
              ];
        });
        setGuestItems(deriveShoppingListItems(recipes));
      })
      .catch(() => {
        if (cancelled) return;
        setGuestItems(null);
        setStorageWarning(true);
      });

    return () => {
      cancelled = true;
    };
  }, [store]);

  if (guestItems === undefined) return <ShopLoading />;
  if (guestItems === null) {
    return (
      <ShopEmptyState
        title="A plan comes first."
        description="Try a seven-day plan and Foodedo will gather its ingredients here."
        actionLabel="Start a plan"
        message={
          storageWarning
            ? "The temporary plan on this device could not be read."
            : null
        }
      />
    );
  }

  return (
    <section aria-labelledby="shop-heading">
      <div className="max-w-2xl">
        <p className="text-xs font-bold tracking-[0.18em] text-accent uppercase">
          Shop · Temporary preview
        </p>
        <h1
          id="shop-heading"
          className="mt-3 font-display text-5xl leading-[0.96] tracking-[-0.04em] text-foreground sm:text-6xl"
        >
          Your plan, gathered.
        </h1>
        <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground">
          This preview comes from the plan on this device. Keep the plan to
          check items, add extras, and sync the list.
        </p>
        <Link href="/" className={cn(primaryButtonClassName, "mt-8")}>
          <ListChecks aria-hidden="true" className="size-4" />
          Keep this plan
        </Link>
      </div>

      <div className="mt-9 overflow-hidden border-y border-border bg-surface sm:border">
        <ul className="divide-y divide-border">
          {guestItems.map((item) => (
            <li key={item.name} className="px-6 py-5 sm:px-8">
              <p className="font-display text-xl leading-tight tracking-[-0.02em] text-foreground">
                {item.name}
              </p>
              <ul className="mt-2 space-y-1">
                {item.detailLines.map((detailLine, index) => (
                  <li
                    key={`${detailLine}:${index}`}
                    className="text-sm leading-5 text-muted-foreground"
                  >
                    {detailLine}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function AccountShoppingList({ current }: { current: ReadyShoppingState }) {
  const generateFromCurrentPlan = useMutation(
    api.shoppingLists.generateFromCurrentPlan,
  );
  const setItemChecked = useMutation(
    api.shoppingLists.setItemChecked,
  ).withOptimisticUpdate((localStore, { itemId, checked }) => {
    optimisticallyUpdateItem(localStore, itemId, (item) => ({
      ...item,
      checked,
    }));
  });
  const addItem = useMutation(api.shoppingLists.addItem);
  const removeItem = useMutation(
    api.shoppingLists.removeItem,
  ).withOptimisticUpdate((localStore, { itemId }) => {
    optimisticallyUpdateItem(localStore, itemId, (item) => ({
      ...item,
      deletedAt: 0,
    }));
  });
  const restoreItem = useMutation(
    api.shoppingLists.restoreItem,
  ).withOptimisticUpdate((localStore, { itemId }) => {
    optimisticallyUpdateItem(localStore, itemId, (item) => ({
      ...item,
      deletedAt: null,
    }));
  });
  const [formAction, setFormAction] = useState<"generate" | "add" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [manualItemName, setManualItemName] = useState("");
  const [isConfirmingRebuild, setIsConfirmingRebuild] = useState(false);
  const list = current.list;

  async function buildList() {
    setFormAction("generate");
    setMessage(null);
    try {
      const result = await generateFromCurrentPlan({});
      setMessage(
        result.status === "generated"
          ? "Shopping list built from your current plan."
          : generationFailureMessage(result.status),
      );
      if (result.status === "generated") setIsConfirmingRebuild(false);
    } catch {
      setMessage("The shopping list could not be built. Please try again.");
    } finally {
      setFormAction(null);
    }
  }

  async function updateChecked(
    itemId: NonNullable<ReadyShoppingState["list"]>["items"][number]["_id"],
    checked: boolean,
  ) {
    setMessage(null);
    try {
      const result = await setItemChecked({ itemId, checked });
      if (result.status === "not_found") {
        setMessage("That item is no longer on the current shopping list.");
      }
    } catch {
      setMessage("That item could not be updated. Please try again.");
    }
  }

  async function submitManualItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (list === null) return;

    let name: string;
    try {
      name = prepareManualShoppingItemName(manualItemName);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Enter an item.");
      return;
    }

    setFormAction("add");
    setMessage(null);
    try {
      const result = await addItem({ shoppingListId: list._id, name });
      if (result.status === "added") {
        setManualItemName("");
      } else {
        setMessage(
          result.status === "list_full"
            ? "This shopping list is full."
            : "This is no longer the current shopping list.",
        );
      }
    } catch {
      setMessage("That item could not be added. Please try again.");
    } finally {
      setFormAction(null);
    }
  }

  async function deleteItem(
    itemId: NonNullable<ReadyShoppingState["list"]>["items"][number]["_id"],
  ) {
    setMessage(null);
    try {
      const result = await removeItem({ itemId });
      if (result.status === "not_found") {
        setMessage("That item is no longer on the current shopping list.");
      } else {
        setMessage("Item removed. You can restore it below.");
      }
    } catch {
      setMessage("That item could not be removed. Please try again.");
    }
  }

  async function restoreDeletedItem(
    itemId: NonNullable<ReadyShoppingState["list"]>["items"][number]["_id"],
  ) {
    setMessage(null);
    try {
      const result = await restoreItem({ itemId });
      setMessage(
        result.status === "updated"
          ? "Item restored."
          : "That item is no longer available to restore.",
      );
    } catch {
      setMessage("That item could not be restored. Please try again.");
    }
  }

  if (list === null) {
    return (
      <ShopEmptyState
        title="Your plan is ready to shop."
        description="Build one list from every ingredient in your current plan. Foodedo only groups matching names and keeps the recipe quantities visible."
        actionLabel={
          formAction === "generate" ? "Building list…" : "Build shopping list"
        }
        actionIcon={<ShoppingBasket aria-hidden="true" className="size-4" />}
        actionDisabled={formAction !== null}
        message={message}
        onAction={() => void buildList()}
      />
    );
  }

  const visibleItems = list.items.filter((item) => item.deletedAt === null);
  const deletedItems = list.items.filter((item) => item.deletedAt !== null);
  const checkedCount = visibleItems.filter((item) => item.checked).length;
  const isBusy = formAction !== null;

  return (
    <section aria-labelledby="shop-heading">
      <div className="max-w-2xl">
        <p className="text-xs font-bold tracking-[0.18em] text-accent uppercase">
          Shop · Current plan
        </p>
        <h1
          id="shop-heading"
          className="mt-3 font-display text-5xl leading-[0.96] tracking-[-0.04em] text-foreground sm:text-6xl"
        >
          Everything in one place.
        </h1>
        <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground">
          {checkedCount} of {visibleItems.length} items checked. Quantities stay
          attached to their recipes where combining them would be unsafe.
        </p>
      </div>

      {list.isOutOfDate ? (
        <div className="mt-8 border-l-2 border-accent pl-4">
          <p className="max-w-xl text-sm leading-6 text-foreground">
            Your plan changed after this list was built. Your checks and added
            items have not been overwritten.
          </p>
          {isConfirmingRebuild ? (
            <div className="mt-3 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                className={primaryButtonClassName}
                disabled={isBusy}
                onClick={() => void buildList()}
              >
                <RefreshCw aria-hidden="true" className="size-4" />
                {formAction === "generate"
                  ? "Building fresh list…"
                  : "Replace with fresh list"}
              </button>
              <button
                type="button"
                className={secondaryButtonClassName}
                disabled={isBusy}
                onClick={() => setIsConfirmingRebuild(false)}
              >
                Keep this list
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="mt-2 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-accent underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              onClick={() => setIsConfirmingRebuild(true)}
            >
              <RefreshCw aria-hidden="true" className="size-4" />
              Build a fresh list
            </button>
          )}
        </div>
      ) : null}

      {list.hasActiveListConflict ? (
        <p className="mt-6 max-w-xl text-sm leading-6 text-muted-foreground">
          We found another active shopping list. Building a fresh list will
          archive both older copies safely.
        </p>
      ) : null}

      <form
        className="mt-9 flex max-w-2xl gap-3"
        onSubmit={(event) => void submitManualItem(event)}
      >
        <label htmlFor="manual-shopping-item" className="sr-only">
          Add a shopping item
        </label>
        <input
          id="manual-shopping-item"
          name="manual-shopping-item"
          type="text"
          maxLength={SHOPPING_LIST_LIMITS.itemName}
          value={manualItemName}
          placeholder="Add something else"
          className="min-h-12 min-w-0 flex-1 rounded-full border border-border-strong bg-surface-raised px-5 text-base text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none"
          disabled={isBusy}
          onChange={(event) => setManualItemName(event.target.value)}
        />
        <button
          type="submit"
          className="inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-wait disabled:opacity-55 sm:w-auto sm:px-6"
          disabled={isBusy || manualItemName.trim() === ""}
        >
          <Plus aria-hidden="true" className="size-5" />
          <span className="sr-only sm:not-sr-only sm:ml-2 sm:text-sm sm:font-bold">
            Add item
          </span>
        </button>
      </form>

      <div className="mt-8 overflow-hidden border-y border-border bg-surface sm:border">
        {visibleItems.length === 0 ? (
          <p className="px-6 py-10 text-sm text-muted-foreground sm:px-8">
            This list is empty. Add anything else you need above.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {visibleItems.map((item) => {
              return (
                <li
                  key={item._id}
                  className="grid grid-cols-[auto_1fr_auto] items-start gap-4 px-5 py-5 sm:px-8"
                >
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={item.checked}
                    aria-label={`${item.checked ? "Uncheck" : "Check"} ${item.name}`}
                    className={cn(
                      "mt-0.5 inline-flex size-7 items-center justify-center rounded-full border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                      item.checked
                        ? "border-accent bg-accent text-accent-foreground"
                        : "border-border-strong bg-background text-transparent",
                    )}
                    disabled={formAction === "generate"}
                    onClick={() => void updateChecked(item._id, !item.checked)}
                  >
                    <Check aria-hidden="true" className="size-4" />
                  </button>
                  <div className="min-w-0">
                    <p
                      className={cn(
                        "font-display text-xl leading-tight tracking-[-0.02em]",
                        item.checked
                          ? "text-muted-foreground line-through"
                          : "text-foreground",
                      )}
                    >
                      {item.name}
                    </p>
                    {item.detailLines.length > 0 ? (
                      <ul className="mt-2 space-y-1">
                        {item.detailLines.map((detailLine, index) => (
                          <li
                            key={`${detailLine}:${index}`}
                            className="text-sm leading-5 text-muted-foreground"
                          >
                            {detailLine}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1 text-xs font-bold tracking-wide text-muted-foreground uppercase">
                        Added by you
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    aria-label={`Remove ${item.name}`}
                    className="inline-flex size-11 items-center justify-center rounded-full text-muted-foreground hover:text-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger disabled:cursor-wait disabled:opacity-50"
                    disabled={formAction === "generate"}
                    onClick={() => void deleteItem(item._id)}
                  >
                    <Trash2 aria-hidden="true" className="size-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {deletedItems.length > 0 ? (
        <details className="mt-5 max-w-2xl border-t border-border pt-4">
          <summary className="min-h-11 cursor-pointer py-3 text-sm font-bold text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
            Removed items ({deletedItems.length})
          </summary>
          <ul className="divide-y divide-border">
            {deletedItems.map((item) => (
              <li
                key={item._id}
                className="flex min-h-14 items-center justify-between gap-4 py-2"
              >
                <span className="text-sm text-muted-foreground">
                  {item.name}
                </span>
                <button
                  type="button"
                  className="inline-flex min-h-11 items-center gap-2 px-2 text-sm font-bold text-accent underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-wait"
                  disabled={formAction === "generate"}
                  onClick={() => void restoreDeletedItem(item._id)}
                >
                  <Undo2 aria-hidden="true" className="size-4" />
                  Restore
                </button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <p
        className="mt-4 min-h-5 text-sm text-muted-foreground"
        aria-live="polite"
      >
        {message}
      </p>
    </section>
  );
}

function optimisticallyUpdateItem(
  localStore: OptimisticLocalStore,
  itemId: string,
  update: (
    item: NonNullable<ReadyShoppingState["list"]>["items"][number],
  ) => NonNullable<ReadyShoppingState["list"]>["items"][number],
) {
  const current = localStore.getQuery(api.shoppingLists.getCurrent, {});
  if (current?.status !== "ready" || current.list === null) return;

  localStore.setQuery(
    api.shoppingLists.getCurrent,
    {},
    {
      ...current,
      list: {
        ...current.list,
        items: current.list.items.map((item) =>
          item._id === itemId ? update(item) : item,
        ),
      },
    },
  );
}

function ShopEmptyState({
  title,
  description,
  actionLabel,
  actionIcon,
  actionDisabled = false,
  message = null,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel: string;
  actionIcon?: React.ReactNode;
  actionDisabled?: boolean;
  message?: string | null;
  onAction?: () => void;
}) {
  return (
    <section aria-labelledby="shop-heading">
      <p className="text-xs font-bold tracking-[0.18em] text-accent uppercase">
        Shop · Current plan
      </p>
      <h1
        id="shop-heading"
        className="mt-3 max-w-2xl font-display text-5xl leading-[0.96] tracking-[-0.04em] text-foreground sm:text-6xl"
      >
        {title}
      </h1>
      <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground">
        {description}
      </p>
      {onAction === undefined ? (
        <Link href="/" className={cn(primaryButtonClassName, "mt-8")}>
          <ListChecks aria-hidden="true" className="size-4" />
          {actionLabel}
        </Link>
      ) : (
        <button
          type="button"
          className={cn(primaryButtonClassName, "mt-8")}
          disabled={actionDisabled}
          onClick={onAction}
        >
          {actionIcon}
          {actionLabel}
        </button>
      )}
      <p
        className="mt-4 min-h-5 text-sm text-muted-foreground"
        aria-live="polite"
      >
        {message}
      </p>
    </section>
  );
}

function ShopLoading() {
  return (
    <section aria-labelledby="shop-loading-heading" aria-busy="true">
      <p className="text-xs font-bold tracking-[0.18em] text-accent uppercase">
        Shop · Current plan
      </p>
      <h1
        id="shop-loading-heading"
        className="mt-3 font-display text-5xl leading-[0.96] tracking-[-0.04em] text-foreground sm:text-6xl"
      >
        Gathering your list…
      </h1>
    </section>
  );
}

function generationFailureMessage(
  status:
    | "no_active_plan"
    | "active_plan_conflict"
    | "plan_unavailable"
    | "list_too_large"
    | "too_many_active_lists",
) {
  switch (status) {
    case "no_active_plan":
      return "There is no current plan to shop from.";
    case "active_plan_conflict":
      return "Choose your current plan before building a shopping list.";
    case "plan_unavailable":
      return "A recipe in this plan is unavailable, so the list was not changed.";
    case "list_too_large":
      return "This plan contains too many separate ingredients for one list.";
    case "too_many_active_lists":
      return "The existing shopping lists could not be consolidated safely.";
  }
}
