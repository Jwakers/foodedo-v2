"use client";
import Link from "next/link";
import { Check, ChevronRight } from "lucide-react";
import type { Id } from "../../../convex/_generated/dataModel";
import { useHouseholdSpace } from "@/features/household/household-context";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerBody,
} from "@/components/ui/drawer";
import { formatPlanDateRange } from "@/lib/domain/plan-display";
import { personalRecipeDetailPath } from "@/lib/routing/recipes";
import { cn } from "@/lib/utils/cn";
import type { ShoppingItem, ShoppingListSummary } from "./shopping-list-types";

export function ShoppingListHistoryDrawer({
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

export function IngredientSourcesDrawer({
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
  const { isHousehold } = useHouseholdSpace();
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
              <ul className="-mx-page-inline border-t border-border">
                {item.sources.map((source, index) => (
                  <li
                    key={`${source.recipeId}:${source.date ?? index}`}
                    className="border-b border-border"
                  >
                    <Link
                      href={personalRecipeDetailPath(
                        source.recipeId,
                        source.requestedServings,
                        source.requestedServings,
                      )}
                      className="flex min-h-17 items-center gap-3 px-page-inline py-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-cadmium"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-16 font-semibold text-ink">
                          {source.recipeTitle}
                        </span>
                        <span className="mt-0.5 block text-13 text-graphite">
                          {formatSourceAmount(source.amount, item.name)}
                        </span>
                      </span>
                      <ChevronRight
                        aria-hidden="true"
                        className="size-4 shrink-0 text-graphite"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
              {isHousehold ? (
                <p className="mt-4 text-14 text-graphite">
                  Removes it for everyone. You can undo.
                </p>
              ) : null}
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

function formatSourceAmount(amount: string, itemName: string) {
  const match = amount.match(/^(\d+(?:\.\d+)?)\s*(whole|piece)$/i);
  if (!match) return amount === "" ? itemName : `${amount} ${itemName}`;
  return `${match[1]} ${itemName}`;
}
