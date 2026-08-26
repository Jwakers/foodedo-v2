"use client";

import {
  ClerkFailed,
  ClerkLoaded,
  ClerkLoading,
  Show,
  SignInButton,
  SignOutButton,
} from "@clerk/react";

const isAuthConfigured = Boolean(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() &&
  process.env.NEXT_PUBLIC_CONVEX_URL?.trim(),
);

const buttonClassName =
  "inline-flex min-h-11 items-center justify-center rounded-full px-4 py-2 text-sm font-semibold text-[var(--ink)] underline decoration-[var(--line-strong)] underline-offset-4 transition-colors hover:text-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]";

export function AuthControls() {
  if (!isAuthConfigured) {
    return (
      <p className="py-3 text-sm text-[var(--muted)]">Account unavailable</p>
    );
  }

  return <ConfiguredAuthControls />;
}

function ConfiguredAuthControls() {
  return (
    <div className="flex items-center">
      <ClerkLoading>
        <p className="py-3 text-sm text-[var(--muted)]" aria-live="polite">
          Loading…
        </p>
      </ClerkLoading>

      <ClerkFailed>
        <p className="py-3 text-sm text-[var(--error)]" role="alert">
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
