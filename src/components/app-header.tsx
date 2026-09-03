"use client";

import Link from "next/link";
import {
  ClerkFailed,
  ClerkLoaded,
  ClerkLoading,
  Show,
  SignInButton,
  SignOutButton,
} from "@clerk/react";

import { AppNavigation } from "@/components/app-navigation";
import { Button } from "@/components/ui/button";

export function AppHeader() {
  return (
    <header className="w-full border-b border-control-muted bg-background">
      <div className="mx-auto flex w-full max-w-175 items-center justify-between gap-4 px-page-inline py-4 sm:px-8">
        <Link
          href="/"
          className="font-display text-16 font-bold tracking-heading text-ink"
        >
          Foodedo
        </Link>

        <AppNavigation placement="header" />

        <ClerkLoading>
          <div className="h-12 w-24 rounded-compact bg-mist" />
        </ClerkLoading>

        <ClerkFailed>
          <Button variant="secondary" type="button" disabled>
            Sign in/out
          </Button>
        </ClerkFailed>

        <ClerkLoaded>
          <Show when="signed-out">
            <SignInButton mode="modal">
              <Button type="button" variant="primary">
                Sign in
              </Button>
            </SignInButton>
          </Show>

          <Show when="signed-in">
            <SignOutButton>
              <Button type="button" variant="secondary">
                Sign out
              </Button>
            </SignOutButton>
          </Show>
        </ClerkLoaded>
      </div>
    </header>
  );
}

