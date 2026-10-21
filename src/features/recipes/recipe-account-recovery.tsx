"use client";

import { useClerk } from "@clerk/react";

import { AccountConnectionError } from "@/components/account-connection-error";
import { Button } from "@/components/ui/button";
import type { FoodedoAuthStatus } from "@/features/auth/use-foodedo-auth";

/** Account-owned recipes must offer recovery instead of a skipped-query spinner. */
export function RecipeAccountRecovery({
  status,
}: {
  status: FoodedoAuthStatus;
}) {
  const { openSignIn } = useClerk();
  if (status === "connection_error") return <AccountConnectionError />;
  if (status !== "guest")
    return (
      <main
        aria-busy="true"
        className="mx-auto w-full max-w-175 px-page-inline py-16 text-center text-14 text-graphite"
      >
        Checking your account…
      </main>
    );
  return (
    <main className="mx-auto flex w-full max-w-175 flex-col items-start gap-4 px-page-inline py-16">
      <h1 className="font-display text-30 font-semibold tracking-title text-ink">
        Sign in to open this recipe
      </h1>
      <p className="text-15 leading-relaxed text-graphite">
        Your private and household recipes are available when you’re signed in.
      </p>
      <Button onClick={() => openSignIn({})}>Sign in</Button>
    </main>
  );
}
