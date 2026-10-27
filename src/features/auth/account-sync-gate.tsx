"use client";

import { useAuth, useClerk } from "@clerk/react";
import { useConvexAuth, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { LoaderCircle, RotateCw } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { Button, ButtonLink } from "@/components/ui/button";
import { siteUrl } from "@/lib/seo/site-url";

/** Personal queries require a synced account, not only a valid Clerk token. */
export function AccountSyncGate({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const canReadAccount =
    isLoaded && isSignedIn && isAuthenticated && !isLoading;
  const account = useQuery(api.users.current, canReadAccount ? {} : "skip");

  if (canReadAccount && (!account || account.authSubject !== userId)) {
    return <AccountSyncWaiting key={userId} />;
  }
  return children;
}

function AccountSyncWaiting() {
  const { signOut } = useClerk();
  const router = useRouter();
  const [isDelayed, setIsDelayed] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutFailed, setSignOutFailed] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setIsDelayed(true), 10_000);
    return () => window.clearTimeout(timer);
  }, []);

  async function continueAsGuest() {
    if (isSigningOut) return;
    setIsSigningOut(true);
    setSignOutFailed(false);
    try {
      await signOut();
      router.replace("/?try=1");
    } catch {
      setIsSigningOut(false);
      setSignOutFailed(true);
    }
  }

  return (
    <main
      className="mx-auto flex min-h-[70vh] w-full max-w-175 flex-col justify-center px-page-inline py-10"
      aria-labelledby="account-sync-heading"
    >
      <p className="text-12 font-bold tracking-label text-leaf uppercase">
        Account setup
      </p>
      <div role="status" aria-live="polite">
        <h1
          id="account-sync-heading"
          className="mt-3 font-display text-30 font-semibold tracking-title text-ink"
        >
          {isDelayed
            ? "Your account is taking a little longer"
            : "Preparing your Foodedo account"}
        </h1>
        <p className="mt-3 max-w-120 text-15 leading-relaxed text-graphite">
          {isDelayed
            ? "Your sign-in worked, but we haven’t finished preparing your account. You can try again or continue as a guest."
            : "Your sign-in worked. We’re getting your account ready and will continue automatically."}
        </p>
      </div>
      <p className="mt-3 max-w-120 text-14 leading-relaxed text-graphite">
        Any unsaved plan on this device will be kept. It won’t be saved to your
        account until setup finishes.
      </p>
      <div className="mt-6 flex max-w-100 flex-col gap-3">
        {isDelayed && (
          <Button
            disabled={isSigningOut}
            onClick={() => window.location.reload()}
          >
            Try again <RotateCw aria-hidden="true" className="size-4" />
          </Button>
        )}
        {!isDelayed && (
          <LoaderCircle
            aria-hidden="true"
            className="mb-2 size-6 text-leaf motion-safe:animate-spin"
          />
        )}
        <Button
          variant="secondary"
          disabled={isSigningOut}
          onClick={() => void continueAsGuest()}
        >
          {isSigningOut ? "Signing out…" : "Sign out and continue as guest"}
        </Button>
        {isDelayed && (
          <ButtonLink
            href={siteUrl("/support/contact")}
            target="_blank"
            rel="noopener noreferrer"
            variant="inline"
            className="min-h-11 justify-center"
          >
            Get help
          </ButtonLink>
        )}
      </div>
      {signOutFailed && (
        <p role="alert" className="mt-3 text-14 text-danger">
          We couldn’t sign you out. Check your connection and try again.
        </p>
      )}
    </main>
  );
}
