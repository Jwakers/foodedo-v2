"use client";

import { ChevronLeft, X } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  DrawerClose,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useDrawerStack } from "@/components/ui/drawer-stack";

/**
 * Canonical header for pushed drawer-stack panes: plain Back, title (+ optional
 * subtitle), plain Close. Root panes should not use this.
 */
export function DrawerStackHeader({
  title,
  description,
  backLabel = "Back",
  closeLabel = "Close",
}: {
  title: ReactNode;
  description?: ReactNode;
  backLabel?: string;
  closeLabel?: string;
}) {
  const { canPop, pop } = useDrawerStack();

  return (
    <DrawerHeader className="items-center gap-2 px-page-inline pt-1 pb-3">
      {canPop ? (
        <Button
          variant="ghost"
          size="headerIcon"
          aria-label={backLabel}
          onClick={pop}
        >
          <ChevronLeft aria-hidden="true" className="size-5" strokeWidth={2} />
        </Button>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <DrawerTitle>{title}</DrawerTitle>
        {description ? (
          <DrawerDescription>{description}</DrawerDescription>
        ) : null}
      </div>
      <DrawerClose asChild>
        <Button variant="ghost" size="headerIcon" aria-label={closeLabel}>
          <X aria-hidden="true" className="size-5" />
        </Button>
      </DrawerClose>
    </DrawerHeader>
  );
}
