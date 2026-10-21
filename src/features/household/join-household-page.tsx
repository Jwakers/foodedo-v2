"use client";
import { useEffect, useState } from "react";
import { useClerk, useUser } from "@clerk/react";
import { useMutation, useQuery } from "convex/react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import { AccountConnectionError } from "@/components/account-connection-error";
import { Button, ButtonLink } from "@/components/ui/button";
import { useFoodedoAuth } from "@/features/auth/use-foodedo-auth";
import { useHouseholdSpace } from "./household-context";
import { forgetInvite, rememberInvite } from "./invite-continuation";

export function JoinHouseholdPage() {
  const token = useSearchParams().get("token") ?? "";
  const [now, setNow] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const { user } = useUser();
  const { openSignIn, signOut } = useClerk();
  const auth = useFoodedoAuth();
  const { household, ready, select } = useHouseholdSpace();
  const router = useRouter();
  const invitation = useQuery(
    api.households.previewInvite,
    now === null ? "skip" : { token, now },
  );
  const join = useMutation(api.households.acceptInvite);
  useEffect(() => {
    if (!token) return;
    // Only carry the invitation through authentication. Once signed in, its
    // URL is the source of truth; remounting after joining must not re-arm it.
    if (auth.status === "guest") rememberInvite(token);
    else if (auth.isAuthenticated) forgetInvite();
  }, [auth.status, auth.isAuthenticated, token]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    const initial = window.setTimeout(() => setNow(Date.now()), 0);
    return () => {
      clearInterval(timer);
      clearTimeout(initial);
    };
  }, [token]);
  const sameHousehold =
    !!household && invitation?.householdId === household._id;
  async function accept() {
    if (busy) return;
    setBusy(true);
    try {
      const id = await join({ token });
      forgetInvite();
      select("household", id);
      router.replace("/week");
      toast.success("You’re in. Welcome to your household.");
    } catch {
      toast.error(
        "You couldn’t join. The link may have changed; ask for a new invitation or try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (auth.status === "connection_error") return <AccountConnectionError />;
  return (
    <main className="mx-auto flex min-h-[70dvh] w-full max-w-175 flex-col gap-5 px-page-inline pt-7 pb-8">
      <p className="text-12 font-bold tracking-label text-graphite uppercase">
        Household invitation
      </p>
      {!invitation ? (
        <p aria-busy="true">Opening your invitation…</p>
      ) : invitation.status !== "ready" ? (
        <>
          <h1 className="font-display text-34 font-semibold tracking-title">
            This link is unavailable
          </h1>
          <p className="text-16 leading-relaxed text-graphite">
            {invitation.status === "expired"
              ? "This invitation has expired."
              : invitation.status === "used"
                ? "Someone has already used this invitation."
                : invitation.status === "cancelled"
                  ? "This invitation has been cancelled."
                  : "This invitation is no longer available."}{" "}
            Ask the person who invited you for a new link.
          </p>
          <ButtonLink href="/week" onClick={forgetInvite}>
            Go to my week
          </ButtonLink>
        </>
      ) : (
        <>
          <h1 className="font-display text-34 font-semibold tracking-title">
            {sameHousehold
              ? "You’re already here."
              : `${invitation.inviterName} invited you.`}
          </h1>
          <p className="text-16 leading-relaxed text-graphite">
            Plan meals, share the shopping and take turns cooking.
          </p>
          <p className="border-y border-border py-5 text-15 leading-relaxed text-graphite">
            Your private week and shopping list stay as they are. Your saved
            recipes stay private.
          </p>
          {auth.status === "guest" ? (
            <Button className="mt-auto" onClick={() => openSignIn({})}>
              Sign in to continue
            </Button>
          ) : !ready ? (
            <p aria-busy="true">Checking your account…</p>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 border-b border-border pb-4">
                <div className="min-w-0">
                  <p className="text-15 font-semibold">
                    {user?.fullName ?? user?.firstName ?? "Your account"}
                  </p>
                  <p className="break-all text-14 text-graphite">
                    {user?.primaryEmailAddress?.emailAddress}
                  </p>
                </div>
                <Button
                  variant="inline"
                  className="min-h-11 shrink-0"
                  onClick={() =>
                    void signOut({
                      redirectUrl: `/household/join?token=${encodeURIComponent(token)}`,
                    })
                  }
                >
                  Switch account
                </Button>
              </div>
              {sameHousehold ? (
                <Button
                  className="mt-auto"
                  onClick={() => {
                    select("household");
                    forgetInvite();
                    router.replace("/week");
                  }}
                >
                  See our week
                </Button>
              ) : household ? (
                <>
                  <h2 className="text-18 font-bold">
                    You’re already in a household
                  </h2>
                  <p className="text-15 leading-relaxed text-graphite">
                    Leave your current household before joining this one. We’ll
                    keep this invitation ready for you.
                  </p>
                  <ButtonLink
                    href={`/household?invite=${encodeURIComponent(token)}`}
                  >
                    View household &amp; leave
                  </ButtonLink>
                  <ButtonLink
                    href="/week"
                    variant="secondary"
                    onClick={forgetInvite}
                  >
                    Stay in my household
                  </ButtonLink>
                </>
              ) : (
                <Button
                  className="mt-auto"
                  disabled={busy}
                  onClick={() => void accept()}
                >
                  {busy ? "Joining…" : "Join household"}
                </Button>
              )}
            </>
          )}
        </>
      )}
    </main>
  );
}
