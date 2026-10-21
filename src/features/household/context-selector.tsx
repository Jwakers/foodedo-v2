"use client";
import { useState } from "react";
import { Check, ChevronDown, UserRound, UsersRound } from "lucide-react";
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { useHouseholdSpace } from "./household-context";

export function ContextSelector() {
  const { household, isHousehold, select } = useHouseholdSpace();
  const [open, setOpen] = useState(false);
  if (!household) return null;
  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger
        className="flex min-h-11 w-30 shrink-0 items-center justify-center gap-2 rounded-full border border-border bg-paper px-3 text-14 font-semibold leading-4.5 text-ink focus-visible:outline-2 focus-visible:outline-cadmium"
        aria-label={`Plan and shop for ${isHousehold ? "Household" : "Private"}`}
      >
        {isHousehold ? "Household" : "Private"}
        <ChevronDown className="size-3.5 text-graphite" aria-hidden="true" />
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <div>
            <DrawerTitle className="text-30">Plan and shop for</DrawerTitle>
            <DrawerDescription className="sr-only">
              Choose your shared household or private meals and shopping.
            </DrawerDescription>
          </div>
        </DrawerHeader>
        <DrawerBody className="pb-[max(34px,env(safe-area-inset-bottom))]">
          {(["household", "private"] as const).map((value) => {
            const active = (value === "household") === isHousehold;
            const Icon = value === "household" ? UsersRound : UserRound;
            return (
              <button
                type="button"
                key={value}
                aria-pressed={active}
                className="flex min-h-18 w-full items-center gap-3 border-b border-border text-left focus-visible:outline-2 focus-visible:outline-cadmium"
                onClick={() => {
                  select(value);
                  setOpen(false);
                }}
              >
                <Icon
                  className={`size-5.5 shrink-0 ${value === "household" ? "text-leaf" : "text-ink"}`}
                  aria-hidden="true"
                />
                <span className="flex-1">
                  <span className="block text-17 font-bold text-ink">
                    {value === "household" ? "Household" : "Private"}
                  </span>
                  <span className="block text-14 text-graphite">
                    {value === "household"
                      ? "Shared meals and shopping"
                      : "Your own meals and shopping"}
                  </span>
                </span>
                <span className="flex size-11 items-center justify-center">
                  {active ? (
                    <Check className="size-5 text-leaf" aria-hidden="true" />
                  ) : null}
                </span>
              </button>
            );
          })}
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}
