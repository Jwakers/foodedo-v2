"use client";

import { Drawer as DrawerPrimitive } from "vaul";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils/cn";

export const Drawer = DrawerPrimitive.Root;
export const DrawerTrigger = DrawerPrimitive.Trigger;
export const DrawerClose = DrawerPrimitive.Close;

export function DrawerContent({
  className,
  children,
  ...props
}: ComponentProps<typeof DrawerPrimitive.Content>) {
  return (
    <DrawerPrimitive.Portal>
      <DrawerPrimitive.Overlay className="fixed inset-0 z-50 bg-scrim" />
      <DrawerPrimitive.Content
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[min(85dvh,42rem)] w-full max-w-175 flex-col overflow-hidden rounded-t-lg bg-paper outline-none",
          className,
        )}
        {...props}
      >
        <DrawerPrimitive.Handle className="my-2.5 h-1 w-9.5 shrink-0 rounded-full bg-sheet-handle" />
        {children}
      </DrawerPrimitive.Content>
    </DrawerPrimitive.Portal>
  );
}

export function DrawerHeader({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-start justify-between gap-1 px-page-inline pb-3",
        className,
      )}
      {...props}
    />
  );
}

export function DrawerBody({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "min-h-0 flex-1 overflow-y-auto px-page-inline pb-6",
        className,
      )}
      {...props}
    />
  );
}

export function DrawerFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "shrink-0 border-t border-border bg-paper px-page-inline pt-3 pb-[max(14px,env(safe-area-inset-bottom))]",
        className,
      )}
      {...props}
    />
  );
}

export function DrawerTitle({
  className,
  ...props
}: ComponentProps<typeof DrawerPrimitive.Title>) {
  return (
    <DrawerPrimitive.Title
      className={cn(
        "font-display text-24 font-semibold tracking-title text-ink",
        className,
      )}
      {...props}
    />
  );
}

export function DrawerDescription({
  className,
  ...props
}: ComponentProps<typeof DrawerPrimitive.Description>) {
  return (
    <DrawerPrimitive.Description
      className={cn("text-13 text-graphite", className)}
      {...props}
    />
  );
}
