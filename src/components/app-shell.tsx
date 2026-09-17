"use client";

import type { ReactNode } from "react";

import { AppHeader } from "@/components/app-header";
import { AppNavigation } from "@/components/app-navigation";
import { AppToaster } from "@/components/app-toaster";
import { UnfinishedInteractionViewport } from "@/components/unfinished-interaction-viewport";
import { useShowAppChrome } from "@/components/use-home-entry-state";
import { GuestPlanClaimResume } from "@/features/plan/guest-plan-claim";
import {
  GuestPlanReviewChromeProvider,
  useGuestPlanReviewDockHidden,
} from "@/features/plan/guest-plan-review-chrome";
import { CatalogueSaveIntentResume } from "@/features/recipes/catalogue-recipe-library";
import { cn } from "@/lib/utils/cn";
import { isCookPath } from "@/lib/routing/recipes";
import { usePathname } from "next/navigation";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <GuestPlanReviewChromeProvider>
      <AppShellChrome>{children}</AppShellChrome>
    </GuestPlanReviewChromeProvider>
  );
}

function AppShellChrome({ children }: { children: ReactNode }) {
  const showChrome = useShowAppChrome();
  const pathname = usePathname();
  const isCooking = isCookPath(pathname);
  const hideDockForGuestReview = useGuestPlanReviewDockHidden();
  const showDock = showChrome && !hideDockForGuestReview && !isCooking;

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <CatalogueSaveIntentResume />
      <AppToaster dockVisible={showDock} />
      {process.env.NODE_ENV === "development" ? (
        <UnfinishedInteractionViewport dockVisible={showDock} />
      ) : null}
      <GuestPlanClaimResume />
      {showChrome && !isCooking ? <AppHeader /> : null}
      <div className={cn("flex-1", showDock && "pb-(--app-nav-height)")}>
        {children}
      </div>
      {showDock ? <AppNavigation /> : null}
    </div>
  );
}
