"use client";

import { CircleCheck, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerBody,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

const saveBenefits = [
  {
    title: "Keep this exact week",
    description: "Your swaps and free days stay as you’ve set them",
  },
  {
    title: "One clean shopping list",
    description: "Your saved meals become a checkable list in Shopping",
  },
  {
    title: "Come back anytime",
    description: "Pick up this week on any device after you sign in",
  },
] as const;

/**
 * Contextual auth sheet before guest Save. X and Not now both dismiss only —
 * the generated plan (and edits) stay on the review screen.
 */
export function SavePlanDrawer({
  open,
  onOpenChange,
  onSignInToSave,
  isPreparing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSignInToSave: () => void | Promise<void>;
  isPreparing: boolean;
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <DrawerTitle>Save this week</DrawerTitle>
            <DrawerDescription>
              Sign in to keep this exact plan and come back to it on any device.
            </DrawerDescription>
          </div>
          <DrawerClose asChild>
            <Button
              variant="quiet"
              size="headerIcon"
              aria-label="Close and keep planning"
              className="text-ink"
            >
              <X aria-hidden="true" className="size-5" />
            </Button>
          </DrawerClose>
        </DrawerHeader>

        <DrawerBody className="flex flex-col gap-2.5 pt-1">
          {saveBenefits.map((benefit) => (
            <div key={benefit.title} className="flex items-start gap-3">
              <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-leaf-soft text-leaf">
                <CircleCheck
                  aria-hidden="true"
                  className="size-3.5"
                  strokeWidth={2}
                />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-14 font-bold leading-5 text-ink">
                  {benefit.title}
                </p>
                <p className="text-12 leading-4.5 text-graphite">
                  {benefit.description}
                </p>
              </div>
            </div>
          ))}
        </DrawerBody>

        <DrawerFooter className="gap-1">
          <Button
            className="w-full"
            disabled={isPreparing}
            aria-busy={isPreparing}
            onClick={() => {
              void onSignInToSave();
            }}
          >
            {isPreparing ? "Preparing…" : "Sign in to save"}
          </Button>
          <DrawerClose asChild>
            <Button variant="inline" size="block" className="text-ink">
              Not now
            </Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
