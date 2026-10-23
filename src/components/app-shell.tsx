"use client";

import { Suspense, type ReactNode } from "react";

import { useHouseholdSpace } from "@/features/household/household-context";
import { NativeInviteLinks } from "@/features/household/native-invite-links";
import { InviteContinuation } from "@/features/household/invite-continuation";
import { FoodedoHelpProvider } from "@/features/onboarding/foodedo-help";
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
import { RecipeImportIntentResume } from "@/features/recipes/recipe-import-intent-resume";
import { RecipeImportNotifications } from "@/features/recipes/recipe-import-notifications";
import { cn } from "@/lib/utils/cn";
import { isCookPath } from "@/lib/routing/recipes";
import { usePathname } from "next/navigation";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <FoodedoHelpProvider>
      <GuestPlanReviewChromeProvider>
        <AppShellChrome>{children}</AppShellChrome>
      </GuestPlanReviewChromeProvider>
    </FoodedoHelpProvider>
  );
}

function AppShellChrome({ children }: { children: ReactNode }) {
  const { spaceKey } = useHouseholdSpace();
  const showChrome = useShowAppChrome();
  const pathname = usePathname();
  const isCooking = isCookPath(pathname);
  const hideDockForGuestReview = useGuestPlanReviewDockHidden();
  const isAdmin = pathname.startsWith("/admin/");
  const showDock =
    showChrome && !hideDockForGuestReview && !isCooking && !isAdmin;

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <CatalogueSaveIntentResume />
      <RecipeImportIntentResume />
      <AppToaster dockVisible={showDock} />
      <RecipeImportNotifications />
      {process.env.NODE_ENV === "development" ? (
        <UnfinishedInteractionViewport dockVisible={showDock} />
      ) : null}
      <NativeInviteLinks />
      <InviteContinuation />
      <GuestPlanClaimResume />
      {showChrome && !isCooking ? (
        <Suspense fallback={null}>
          <AppHeader />
        </Suspense>
      ) : null}
      <div
        key={spaceKey}
        className={cn("flex-1", showDock && "pb-(--app-nav-height)")}
      >
        {children}
      </div>
      {showDock ? <AppNavigation /> : null}
    </div>
  );
}
