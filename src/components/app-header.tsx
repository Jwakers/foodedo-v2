"use client";

import {
  ClerkFailed,
  ClerkLoaded,
  ClerkLoading,
  Show,
  SignInButton,
  UserButton,
} from "@clerk/react";
import { BrandLogo } from "@/components/brand-logo";

export function AppHeader() {
  return (
    <header className="sticky top-0 z-40 bg-paper pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex h-13 w-full max-w-175 items-center justify-between px-page-inline">
        <BrandLogo href="/" />

        <ClerkLoading>
          <div className="size-9 rounded-full bg-mist" aria-hidden="true" />
        </ClerkLoading>

        <ClerkFailed>
          <span className="inline-flex min-h-11 items-center px-1 text-13 font-bold text-graphite">
            Sign in
          </span>
        </ClerkFailed>

        <ClerkLoaded>
          <Show when="signed-out">
            <SignInButton mode="modal">
              <button
                type="button"
                className="inline-flex min-h-11 items-center px-1 text-13 font-bold leading-4 text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cadmium"
              >
                Sign in
              </button>
            </SignInButton>
          </Show>

          <Show when="signed-in">
            <AccountButton />
          </Show>
        </ClerkLoaded>
      </div>
    </header>
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
