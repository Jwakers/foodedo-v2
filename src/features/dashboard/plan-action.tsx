"use client";

import {
  ClerkFailed,
  ClerkLoaded,
  ClerkLoading,
  Show,
  useAuth,
  useClerk,
} from "@clerk/react";
import { ArrowRight, CircleCheck, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

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
  DrawerTrigger,
} from "@/components/ui/drawer";
import {
  createAdjustPlanIntent,
  readAdjustPlanIntent,
} from "@/lib/domain/auth-intents";
import { createAdjustPlanIntentStore } from "@/lib/platform/auth-intent-store";

const guestBenefits = [
  {
    title: "Usual plan length",
    description: "3, 5 or 7 days — remembered next time",
  },
  {
    title: "Servings",
    description: "Sized for your household and shopping list",
  },
  {
    title: "Dietary & planning preferences",
    description: "Prefer recipes you like — remembered next time",
  },
] as const;

export function PlanAction() {
  const [open, setOpen] = useState(false);
  const { isLoaded, isSignedIn } = useAuth();
  const { openSignIn } = useClerk();
  // Vaul treats nested Clerk modal clicks as outside-dismiss. Close the drawer
  // before opening Clerk, and keep the intent for post-auth Adjust resume.
  const preserveIntentOnCloseRef = useRef(false);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;

    let cancelled = false;

    void (async () => {
      const store = createAdjustPlanIntentStore();
      const intent = readAdjustPlanIntent(await store.read());
      if (!intent || cancelled) return;

      // Resume Adjust even if clearing the one-shot intent fails.
      setOpen(true);
      try {
        await store.clear();
      } catch (error) {
        console.error("Failed to clear adjust-plan resume intent.", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn]);

  function handlePlanWeek() {
    window.alert("Weekly planning is coming next.");
  }

  function handleDrawerOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen || isSignedIn) return;

    if (preserveIntentOnCloseRef.current) {
      preserveIntentOnCloseRef.current = false;
      return;
    }

    void createAdjustPlanIntentStore().clear();
  }

  async function beginPersonaliseSignIn() {
    try {
      await createAdjustPlanIntentStore().write(
        createAdjustPlanIntent({ now: Date.now() }),
      );
    } catch (error) {
      console.error("Failed to store adjust-plan resume intent.", error);
      window.alert(
        "Foodedo couldn’t save your place. Check storage access and try again.",
      );
      return;
    }

    // openSignIn returns void with no dismissal callback; keep the intent so
    // Adjust can resume after auth, and skip clearing when this close is for Clerk.
    preserveIntentOnCloseRef.current = true;
    setOpen(false);
    openSignIn({});
  }

  return (
    <div className="mt-3 flex flex-col gap-2">
      <Button className="w-full" onClick={handlePlanWeek}>
        Plan my week
        <ArrowRight aria-hidden="true" className="size-4.5" />
      </Button>

      <div className="flex items-center justify-between gap-3 px-1">
        <p className="text-13 text-graphite">
          7 days · starts tomorrow · serves 4
        </p>

        <Drawer open={open} onOpenChange={handleDrawerOpenChange}>
          <DrawerTrigger asChild>
            <Button variant="inline" className="text-ink">
              Adjust
            </Button>
          </DrawerTrigger>
          <DrawerContent>
            <ClerkLoading>
              <LoadingDrawerContent />
            </ClerkLoading>
            <ClerkFailed>
              <UnavailableDrawerContent />
            </ClerkFailed>
            <ClerkLoaded>
              <Show when="signed-out">
                <GuestDrawerContent onPersonalise={beginPersonaliseSignIn} />
              </Show>
              <Show when="signed-in">
                <SignedInDrawerContent />
              </Show>
            </ClerkLoaded>
          </DrawerContent>
        </Drawer>
      </div>
    </div>
  );
}

function GuestDrawerContent({
  onPersonalise,
}: {
  onPersonalise: () => void | Promise<void>;
}) {
  return (
    <>
      <DrawerHeader>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <DrawerTitle>Make Foodedo fit your week</DrawerTitle>
          <DrawerDescription>
            Sign in to choose your usual plan length, servings and preferences.
            Foodedo will remember them next time — or close this and keep
            planning with sensible defaults.
          </DrawerDescription>
        </div>
        <DrawerDismissButton />
      </DrawerHeader>

      <DrawerBody className="flex flex-col gap-2 pt-1">
        {guestBenefits.map((benefit) => (
          <Benefit key={benefit.title} {...benefit} />
        ))}
      </DrawerBody>

      <DrawerFooter>
        <Button className="w-full" onClick={() => void onPersonalise()}>
          Sign in to personalise
        </Button>
      </DrawerFooter>
    </>
  );
}

function SignedInDrawerContent() {
  return (
    <>
      <DrawerHeader>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <DrawerTitle>Adjust your plan</DrawerTitle>
          <DrawerDescription>
            Change what matters. Foodedo handles the rest.
          </DrawerDescription>
        </div>
        <DrawerDismissButton />
      </DrawerHeader>
      <DrawerBody className="pt-2">
        <p className="text-15 leading-relaxed text-graphite">
          Personal planning controls are coming next. You’ll be able to adjust
          plan length, servings and preferences here.
        </p>
      </DrawerBody>
    </>
  );
}

function LoadingDrawerContent() {
  return (
    <>
      <DrawerHeader>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <DrawerTitle>Adjust your plan</DrawerTitle>
          <DrawerDescription>Checking your account status…</DrawerDescription>
        </div>
        <DrawerDismissButton />
      </DrawerHeader>
      <DrawerBody>
        <div className="h-24 animate-pulse rounded-sm bg-mist" />
      </DrawerBody>
    </>
  );
}

function UnavailableDrawerContent() {
  return (
    <>
      <DrawerHeader>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <DrawerTitle>Adjust your plan</DrawerTitle>
          <DrawerDescription>
            Account status is temporarily unavailable.
          </DrawerDescription>
        </div>
        <DrawerDismissButton />
      </DrawerHeader>
      <DrawerBody>
        <p className="text-15 leading-relaxed text-graphite">
          Close this drawer and try again shortly.
        </p>
      </DrawerBody>
    </>
  );
}

function DrawerDismissButton() {
  return (
    <DrawerClose asChild>
      <button
        type="button"
        aria-label="Close adjustments"
        className="flex size-11 shrink-0 items-center justify-center rounded-full bg-mist text-ink transition-colors hover:bg-border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cadmium"
      >
        <X aria-hidden="true" className="size-5" />
      </button>
    </DrawerClose>
  );
}

function Benefit({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-sm bg-mist px-3 py-2">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-leaf-soft text-leaf">
        <CircleCheck aria-hidden="true" className="size-4" strokeWidth={1.75} />
      </span>
      <div className="min-w-0">
        <p className="text-14 font-semibold leading-4.5 text-ink">{title}</p>
        <p className="text-12 leading-4 text-graphite">{description}</p>
      </div>
    </div>
  );
}
