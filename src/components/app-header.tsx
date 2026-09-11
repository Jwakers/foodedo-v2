"use client";

import {
  ClerkFailed,
  ClerkLoaded,
  ClerkLoading,
  Show,
  SignInButton,
  UserButton,
} from "@clerk/react";
import { Bookmark, ChevronLeft } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { BrandLogo } from "@/components/brand-logo";
import { HeaderModeSlot } from "@/components/header-mode-slot";
import { Button } from "@/components/ui/button";
import { RecipeOverflowMenu } from "@/features/recipes/recipe-overflow-menu";
import { findStandardCatalogueMealBySlug } from "@/lib/domain/standard-catalogue";
import { parseRecipeDetailSlug } from "@/lib/routing/recipes";
import { temporaryFeedback } from "@/lib/ui/temporary-feedback";
import { cn } from "@/lib/utils/cn";

export function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  // Track prior in-app path so Back can distinguish SPA history from deep links.
  // (history.length / history.state.idx are unreliable across browsers and this Next version.)
  const [pathHistory, setPathHistory] = useState<{
    current: string;
    previous: string | null;
  }>({ current: pathname, previous: null });
  if (pathHistory.current !== pathname) {
    setPathHistory({ current: pathname, previous: pathHistory.current });
  }
  const recipeSlug = parseRecipeDetailSlug(pathname);
  const recipe =
    recipeSlug === null ? null : findStandardCatalogueMealBySlug(recipeSlug);
  // Only enter recipe chrome when the slug resolves — avoids fake chrome on 404s
  // and future `/recipes/…` routes that are not catalogue detail pages.
  const isRecipeDetail = recipe !== null;
  const recipeTitle = recipe?.title ?? "recipe";

  return (
    <header className="sticky top-0 z-40 bg-paper pt-[env(safe-area-inset-top)]">
      <div
        className={cn(
          "mx-auto flex h-13.5 w-full max-w-175 items-center transition-[padding] duration-300 ease-out",
          isRecipeDetail ? "px-3" : "px-page-inline",
        )}
      >
        <div
          className={cn(
            "grid shrink-0 overflow-hidden transition-[width,opacity,transform] duration-300 ease-out",
            isRecipeDetail
              ? "w-11 translate-x-0 opacity-100"
              : "pointer-events-none w-0 -translate-x-2 opacity-0",
          )}
          aria-hidden={!isRecipeDetail}
          inert={!isRecipeDetail}
        >
          <Button
            type="button"
            variant="ghost"
            size="headerIcon"
            aria-label="Back"
            tabIndex={isRecipeDetail ? 0 : -1}
            onClick={() => {
              if (pathHistory.previous !== null) {
                router.back();
                return;
              }
              router.push("/recipes");
            }}
          >
            <ChevronLeft
              aria-hidden="true"
              className="size-5"
              strokeWidth={2}
            />
          </Button>
        </div>

        <div
          className={cn(
            "flex min-w-0 flex-1 items-center transition-[padding] duration-300 ease-out",
            isRecipeDetail ? "pl-3" : "pl-0",
          )}
        >
          <BrandLogo href="/" />
        </div>

        <div className="grid shrink-0 grid-cols-1 grid-rows-1 items-center justify-items-end">
          <HeaderModeSlot active={!isRecipeDetail}>
            <DefaultAccountControls />
          </HeaderModeSlot>

          <HeaderModeSlot active={isRecipeDetail} className="gap-0.5">
            <Button
              type="button"
              variant="ghost"
              size="headerIcon"
              aria-label={`Save ${recipeTitle}`}
              tabIndex={isRecipeDetail ? 0 : -1}
              onClick={() => {
                temporaryFeedback("Saving recipes comes next.");
              }}
            >
              <Bookmark
                aria-hidden="true"
                className="size-5"
                strokeWidth={1.8}
              />
            </Button>
            <RecipeOverflowMenu recipeTitle={recipeTitle} />
          </HeaderModeSlot>
        </div>
      </div>
    </header>
  );
}

function DefaultAccountControls() {
  return (
    <>
      <ClerkLoading>
        <div className="size-9 rounded-full bg-mist" aria-hidden="true" />
      </ClerkLoading>

      <ClerkFailed>
        <span className="inline-flex min-h-11 items-center whitespace-nowrap px-1 text-13 font-bold text-graphite">
          Sign in
        </span>
      </ClerkFailed>

      <ClerkLoaded>
        <Show when="signed-out">
          <SignInButton mode="modal">
            <button
              type="button"
              className="inline-flex min-h-11 items-center whitespace-nowrap px-1 text-13 font-bold leading-4 text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cadmium"
            >
              Sign in
            </button>
          </SignInButton>
        </Show>

        <Show when="signed-in">
          <AccountButton />
        </Show>
      </ClerkLoaded>
    </>
  );
}

function AccountButton() {
  return (
    <div className="-mr-1 flex size-11 shrink-0 items-center justify-center">
      <UserButton
        appearance={{
          elements: {
            rootBox: "flex items-center",
            avatarBox: "size-9",
            userButtonTrigger:
              "rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cadmium",
          },
        }}
      >
        <UserButton.MenuItems>
          <UserButton.Action label="manageAccount" />
          <UserButton.Action label="signOut" />
        </UserButton.MenuItems>
      </UserButton>
    </div>
  );
}
