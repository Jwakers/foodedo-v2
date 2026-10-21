"use client";
import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import { Button, ButtonLink } from "@/components/ui/button";
import { useHouseholdSpace } from "./household-context";
import { recipeShareUrl, shareUrl } from "@/lib/platform/recipe-share";
function randomToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
export function InviteLinkPage() {
  const { household, ready, select } = useHouseholdSpace();
  const generate = useMutation(api.households.invite);
  const cancel = useMutation(api.households.cancelInvite);
  const [link, setLink] = useState<{
    token: string;
    expiresAt: number;
    cancelled: boolean;
  } | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const householdId = household?._id;
  useEffect(() => {
    if (!householdId) return;
    let active = true;
    void generate({ householdId, token: randomToken() })
      .then((value) => {
        if (active) setLink(value);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [generate, householdId]);
  async function retry() {
    if (!householdId || busy) return;
    setBusy(true);
    setError(false);
    try {
      setLink(
        await generate({
          householdId,
          token: randomToken(),
          replaceCancelled: true,
        }),
      );
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  const path = link ? `/household/join?token=${link.token}` : null;
  return (
    <main className="mx-auto flex min-h-[70dvh] w-full max-w-175 flex-col gap-5 px-page-inline py-7">
      <ButtonLink variant="inline" href="/household" className="self-start">
        Back
      </ButtonLink>
      <h1 className="font-display text-34 font-semibold tracking-title">
        Invite someone
      </h1>
      <p className="text-16 leading-relaxed text-graphite">
        Share a link by text, WhatsApp or however you like.
      </p>
      {!ready ? (
        <p aria-busy="true">Loading your household…</p>
      ) : !household ? (
        <ButtonLink href="/household">Create a household first</ButtonLink>
      ) : error ? (
        <>
          <p role="alert" className="text-15 text-cadmium">
            Your invite link couldn’t be created.
          </p>
          <Button disabled={busy} onClick={() => void retry()}>
            Try again
          </Button>
        </>
      ) : link?.cancelled ? (
        <>
          <h2 className="text-18 font-bold">Link cancelled</h2>
          <p className="text-15 text-graphite">
            Anyone with the old link will need a new invitation.
          </p>
          <Button disabled={busy} onClick={() => void retry()}>
            Create a new link
          </Button>
        </>
      ) : (
        <>
          <div className="break-all rounded-sm border border-border bg-mist p-4 text-14 text-graphite">
            {path ? recipeShareUrl(path) : "Creating your invitation…"}
          </div>
          <p className="text-14 leading-relaxed text-graphite">
            One person can join with this link. It expires after seven days.
          </p>
          <Button
            disabled={!path}
            onClick={async () => {
              if (!path) return;
              const result = await shareUrl({
                title: "Household invitation",
                url: recipeShareUrl(path),
              });
              if (result === "copied") toast.success("Link copied");
              if (result === "failed")
                toast.error("Couldn’t share the link. Try Copy link.");
            }}
          >
            Share invite link
          </Button>
          <Button
            variant="secondary"
            disabled={!path}
            onClick={async () => {
              if (!path) return;
              try {
                await navigator.clipboard.writeText(recipeShareUrl(path));
                toast.success("Link copied");
              } catch {
                toast.error("Couldn’t copy the link. Try Share invite link.");
              }
            }}
          >
            Copy link
          </Button>
          <Button
            variant="inline"
            disabled={!link || busy}
            className="self-start text-cadmium"
            onClick={async () => {
              if (!householdId || !link) return;
              setBusy(true);
              try {
                await cancel({ householdId, token: link.token });
                setLink({ ...link, cancelled: true });
              } catch {
                toast.error("The link couldn’t be cancelled. Try again.");
              } finally {
                setBusy(false);
              }
            }}
          >
            Cancel this link
          </Button>
          <ButtonLink
            href="/week"
            variant="inline"
            className="mt-auto"
            onClick={() => select("household")}
          >
            See our week
          </ButtonLink>
        </>
      )}
    </main>
  );
}
