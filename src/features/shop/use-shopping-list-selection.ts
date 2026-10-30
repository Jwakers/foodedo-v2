"use client";
import { useEffect } from "react";
import { useQuery } from "convex/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useHouseholdSpace } from "@/features/household/household-context";
import { useFoodedoAuth } from "@/features/auth/use-foodedo-auth";

export function useShoppingListSelection() {
  const { spaceArgs, ready: spaceReady } = useHouseholdSpace();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { status, isAuthenticated } = useFoodedoAuth();
  const current = useQuery(
    api.shoppingLists.getCurrent,
    isAuthenticated && spaceReady ? spaceArgs : "skip",
  );
  const recentLists = useQuery(
    api.shoppingLists.getRecentSummaries,
    isAuthenticated && spaceReady ? spaceArgs : "skip",
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
      ? { ...spaceArgs, shoppingListId: requestedList._id }
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
  return {
    status,
    isAuthenticated,
    spaceReady,
    current,
    recentLists,
    selectedList,
    requestedList,
    currentListId,
    selectList,
  };
}
