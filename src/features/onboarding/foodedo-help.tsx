"use client";

import {
  createContext,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

const HelpContext = createContext<(() => void) | null>(null);
export function useFoodedoHelp() {
  const open = useContext(HelpContext);
  if (!open) throw new Error("FoodedoHelpProvider is required.");
  return open;
}

const concepts = [
  [
    "Start with a suggestion",
    "Foodedo suggests meals for your week. Swap any meal or leave days free before saving.",
  ],
  [
    "Save your favourites",
    "Tap the heart to keep recipes you love in Saved. Your favourites also help shape future meal plans.",
  ],
  [
    "Shop from your plan",
    "Saving your plan brings its ingredients into one shopping list. Change a meal and the list updates too.",
  ],
] as const;

/** A standard drawer keeps the current task mounted while the guide is open. */
export function FoodedoHelpProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const previousFocus = useRef<HTMLElement | null>(null);
  function openHelp() {
    previousFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setOpen(true);
  }
  return (
    <HelpContext.Provider value={openHelp}>
      {children}
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent
          onCloseAutoFocus={(event) => {
            if (previousFocus.current?.isConnected) {
              event.preventDefault();
              previousFocus.current.focus({ preventScroll: true });
            }
          }}
        >
          <DrawerHeader>
            <div className="min-w-0 flex-1">
              <DrawerTitle>How Foodedo works</DrawerTitle>
              <DrawerDescription className="mt-2 text-14 leading-5.5">
                A useful starting point. The rest is yours to change.
              </DrawerDescription>
            </div>
            <Button
              variant="ghost"
              size="headerIcon"
              aria-label="Close How Foodedo works"
              onClick={() => setOpen(false)}
            >
              <X aria-hidden="true" className="size-5" />
            </Button>
          </DrawerHeader>
          <DrawerBody role="region" aria-label="Foodedo guide">
            {concepts.map(([title, body]) => (
              <section key={title} className="border-b border-border py-5">
                <h2 className="font-display text-22 leading-6.75 font-semibold tracking-card">
                  {title}
                </h2>
                <p className="mt-2 text-15 leading-5.75 text-graphite">
                  {body}
                </p>
              </section>
            ))}
            <section className="pt-5">
              <h2 className="text-14 leading-5.5 font-bold">
                Sharing a household?
              </h2>
              <p className="mt-2 text-14 leading-5.5 text-graphite">
                Your shared plans consider everyone’s saved favourites.
              </p>
            </section>
          </DrawerBody>
          <DrawerFooter>
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => setOpen(false)}
            >
              Back to what I was doing
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </HelpContext.Provider>
  );
}
