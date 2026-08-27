"use client";

import {
  ClerkFailed,
  ClerkLoaded,
  ClerkLoading,
  Show,
  SignInButton,
  SignOutButton,
} from "@clerk/react";

const buttonClassName =
  "inline-flex min-h-11 items-center justify-center rounded-full px-4 py-2 text-sm font-semibold text-foreground underline decoration-border-strong underline-offset-4 transition-colors hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground";

export function AuthControls() {
  return (
    <div className="flex items-center">
      <ClerkLoading>
        <p className="py-3 text-sm text-muted-foreground" aria-live="polite">
          Loading…
        </p>
      </ClerkLoading>

      <ClerkFailed>
        <p className="py-3 text-sm text-danger" role="alert">
          Account unavailable
        </p>
      </ClerkFailed>

      <ClerkLoaded>
        <Show when="signed-out">
          <SignInButton mode="modal">
            <button type="button" className={buttonClassName}>
              Sign in
            </button>
          </SignInButton>
        </Show>

        <Show when="signed-in">
          <SignOutButton>
            <button type="button" className={buttonClassName}>
              Sign out
            </button>
          </SignOutButton>
        </Show>
      </ClerkLoaded>
    </div>
  );
}
