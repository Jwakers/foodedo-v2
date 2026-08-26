"use client";

import {
  ClerkFailed,
  ClerkLoaded,
  ClerkLoading,
  Show,
  SignInButton,
  SignOutButton,
} from "@clerk/react";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

const isAuthConfigured = Boolean(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() &&
  process.env.NEXT_PUBLIC_CONVEX_URL?.trim(),
);

const buttonClassName =
  "inline-flex min-h-11 items-center justify-center rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground";

export function AuthControls() {
  if (!isAuthConfigured) {
    return (
      <p className="mt-8 text-sm text-neutral-600 dark:text-neutral-400">
        Authentication is ready for V2 environment configuration.
      </p>
    );
  }

  return <ConfiguredAuthControls />;
}

function ConfiguredAuthControls() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const syncedUser = useQuery(api.users.current, isAuthenticated ? {} : "skip");

  return (
    <div className="mt-8 flex flex-col items-start gap-3">
      <ClerkLoading>
        <p
          className="text-sm text-neutral-600 dark:text-neutral-400"
          aria-live="polite"
        >
          Loading sign in…
        </p>
      </ClerkLoading>

      <ClerkFailed>
        <p className="text-sm text-red-700 dark:text-red-300" role="alert">
          Sign in could not start. Check the connection and try reopening the
          app.
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
          <p
            className="text-sm text-neutral-600 dark:text-neutral-400"
            aria-live="polite"
          >
            {authStatus({ isAuthenticated, isLoading, syncedUser })}
          </p>
        </Show>
      </ClerkLoaded>
    </div>
  );
}

function authStatus({
  isAuthenticated,
  isLoading,
  syncedUser,
}: {
  isAuthenticated: boolean;
  isLoading: boolean;
  syncedUser: { email: string | null; name: string | null } | null | undefined;
}) {
  if (isLoading) return "Connecting Clerk to Convex…";
  if (!isAuthenticated)
    return "Clerk is signed in; Convex authentication is not ready.";
  if (syncedUser === undefined)
    return "Convex is authenticated; checking user sync…";
  if (syncedUser === null)
    return "Convex is authenticated; waiting for the Clerk webhook…";

  return `Clerk and Convex are connected${syncedUser.email ? ` for ${syncedUser.email}` : ""}.`;
}
