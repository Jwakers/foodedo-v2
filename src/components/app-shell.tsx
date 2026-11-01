"use client";

import { Suspense, type ReactNode } from "react";

import { useHouseholdSpace } from "@/features/household/household-context";
import { NativeInviteLinks } from "@/features/household/native-invite-links";
import { InviteContinuation } from "@/features/household/invite-continuation";
import { FoodedoHelpProvider } from "@/features/onboarding/foodedo-help";
import { AppHeader, AppHeaderFallback } from "@/components/app-header";
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
import { RecipeSaveConfirmationProvider } from "@/features/recipes/recipe-save-confirmation";
import { RecipeImportIntentResume } from "@/features/recipes/recipe-import-intent-resume";
import { RecipeImportNotifications } from "@/features/recipes/recipe-import-notifications";
import { cn } from "@/lib/utils/cn";
import { isCookPath, isPublicRecipePath } from "@/lib/routing/recipes";
import { usePathname } from "next/navigation";
import { useFoodedoAuth } from "@/features/auth/use-foodedo-auth";
import { AccountSyncContent } from "@/features/auth/account-sync-gate";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <FoodedoHelpProvider>
      <GuestPlanReviewChromeProvider>
        <RecipeSaveConfirmationProvider>
          <AppShellChrome>{children}</AppShellChrome>
        </RecipeSaveConfirmationProvider>
      </GuestPlanReviewChromeProvider>
    </FoodedoHelpProvider>
  );
}

function AppShellChrome({ children }: { children: ReactNode }) {
  const { spaceKey } = useHouseholdSpace();
  const { userId } = useFoodedoAuth();
  const showChrome = useShowAppChrome();
  const pathname = usePathname();
  const isCooking = isCookPath(pathname);
  const hideDockForGuestReview = useGuestPlanReviewDockHidden();
  const isAdmin = pathname.startsWith("/admin/");
  const showDock =
    showChrome && !hideDockForGuestReview && !isCooking && !isAdmin;

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <AccountContinuations />
      <AppToaster dockVisible={showDock} />
      {process.env.NODE_ENV === "development" ? (
        <UnfinishedInteractionViewport dockVisible={showDock} />
      ) : null}
      <NativeInviteLinks />
      {showChrome && !isCooking ? (
        <Suspense fallback={<AppHeaderFallback />}>
          <AppHeader />
        </Suspense>
      ) : null}
      <div
        key={
          isPublicRecipePath(pathname)
            ? "public-recipe"
            : pathname === "/recipes/view"
              ? `recipe-view:${userId ?? "guest"}`
              : spaceKey
        }
        className={cn("flex-1", showDock && "pb-(--app-nav-height)")}
      >
        <AccountSyncContent>{children}</AccountSyncContent>
      </div>
      {showDock ? <AppNavigation /> : null}
    </div>
  );
}

/** Keep per-account effects isolated without remounting public reading content. */
function AccountContinuations() {
  const { isAuthenticated, userId } = useFoodedoAuth();
  return isAuthenticated && userId ? <OwnerContinuations key={userId} /> : null;
}

function OwnerContinuations() {
  return (
    <>
      <CatalogueSaveIntentResume />
      <RecipeImportIntentResume />
      <RecipeImportNotifications />
      <InviteContinuation />
      <GuestPlanClaimResume />
    </>
  );
}
