"use client";

import type { ReactNode } from "react";

import { AppHeader } from "@/components/app-header";
import { AppNavigation } from "@/components/app-navigation";
import { AppToaster } from "@/components/app-toaster";
import { FeedbackViewport } from "@/components/feedback-viewport";
import { useShowAppChrome } from "@/components/use-home-entry-state";
import { GuestPlanClaimResume } from "@/features/plan/guest-plan-claim";
import {
  GuestPlanReviewChromeProvider,
  useGuestPlanReviewDockHidden,
} from "@/features/plan/guest-plan-review-chrome";
import { CatalogueSaveIntentResume } from "@/features/recipes/catalogue-recipe-library";
import { cn } from "@/lib/utils/cn";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <GuestPlanReviewChromeProvider>
      <AppShellChrome>{children}</AppShellChrome>
    </GuestPlanReviewChromeProvider>
  );
}

function AppShellChrome({ children }: { children: ReactNode }) {
  const showChrome = useShowAppChrome();
  const hideDockForGuestReview = useGuestPlanReviewDockHidden();
  const showDock = showChrome && !hideDockForGuestReview;

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <CatalogueSaveIntentResume />
      <AppToaster dockVisible={showDock} />
      {process.env.NODE_ENV === "development" ? (
        <FeedbackViewport dockVisible={showDock} />
      ) : null}
      <GuestPlanClaimResume />
      {showChrome ? <AppHeader /> : null}
      <div className={cn("flex-1", showDock && "pb-(--app-nav-height)")}>
        {children}
      </div>
      {showDock ? <AppNavigation /> : null}
    </div>
  );
}
