"use client";

import {
  ClerkFailed,
  ClerkLoaded,
  ClerkLoading,
  Show,
  SignInButton,
  useClerk,
  useUser,
} from "@clerk/react";
import Link from "next/link";

import { cn } from "@/lib/utils/cn";

export function AppHeader() {
  return (
    <header className="sticky top-0 z-40 bg-paper pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex h-13 w-full max-w-175 items-center justify-between px-page-inline">
        <Link
          href="/"
          className="font-display text-26 font-bold tracking-brand text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cadmium"
        >
          Foodedo
        </Link>

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
  const { user } = useUser();
  const { openUserProfile } = useClerk();

  if (!user) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={() => openUserProfile()}
      aria-label="Account"
      className="-mr-1 flex size-11 shrink-0 items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cadmium"
    >
      <span
        className={cn(
          "flex size-9 items-center justify-center overflow-hidden rounded-full bg-ink",
          "text-12 font-bold leading-4 text-paper",
        )}
      >
        {user.hasImage ? (
          // Clerk hosts the avatar; a plain img avoids extra remote image config.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.imageUrl}
            alt=""
            className="size-9 rounded-full object-cover"
          />
        ) : (
          getUserInitials(user)
        )}
      </span>
    </button>
  );
}

function getUserInitials(user: {
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  primaryEmailAddress: { emailAddress: string } | null;
}) {
  const first = user.firstName?.trim().charAt(0);
  const last = user.lastName?.trim().charAt(0);

  if (first && last) {
    return `${first}${last}`.toUpperCase();
  }

  if (first) {
    return first.toUpperCase();
  }

  const fallback =
    user.fullName?.trim() ?? user.primaryEmailAddress?.emailAddress ?? "";
  const parts = fallback.split(/[\s@]+/).filter(Boolean);
  const firstPart = parts[0];
  const secondPart = parts[1];

  if (firstPart && secondPart) {
    return `${firstPart.charAt(0)}${secondPart.charAt(0)}`.toUpperCase();
  }

  return (firstPart?.slice(0, 2) ?? "?").toUpperCase();
}
