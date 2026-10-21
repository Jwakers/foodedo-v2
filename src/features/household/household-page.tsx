"use client";
import { useState } from "react";
import { useMutation } from "convex/react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import { AccountConnectionError } from "@/components/account-connection-error";
import { Button, ButtonLink } from "@/components/ui/button";
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useHouseholdSpace } from "./household-context";
import { useFoodedoAuth } from "@/features/auth/use-foodedo-auth";
import { useClerk } from "@clerk/react";
import { forgetInvite } from "./invite-continuation";

export function HouseholdPage() {
  const { household, ready, select } = useHouseholdSpace();
  const { status } = useFoodedoAuth();
  const { openSignIn } = useClerk();
  const create = useMutation(api.households.create);
  const leave = useMutation(api.households.leave);
  const router = useRouter();
  const invite = useSearchParams().get("invite");
  const [leaving, setLeaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const last = household?.members.length === 1;
  async function createHousehold() {
    setBusy(true);
    try {
      const id = await create({});
      select("household", id);
      router.push("/household/invite");
      toast.success("Household created");
    } catch {
      toast.error("Your household couldn’t be created. Try again.");
    } finally {
      setBusy(false);
    }
  }
  async function leaveHousehold() {
    if (!household || busy) return;
    setBusy(true);
    try {
      await leave({ householdId: household._id });
      select("private");
      setLeaving(false);
      toast.success(last ? "Household closed" : "You’ve left the household");
      router.replace(
        invite
          ? `/household/join?token=${encodeURIComponent(invite)}`
          : "/week",
      );
    } catch {
      toast.error("You couldn’t leave yet. Try again.");
    } finally {
      setBusy(false);
    }
  }
  if (status === "connection_error") return <AccountConnectionError />;
  if (status === "guest")
    return (
      <main className="mx-auto flex w-full max-w-175 flex-col gap-5 px-page-inline py-7">
        <h1 className="font-display text-34 font-semibold">Share your week.</h1>
        <p className="text-16 text-graphite">
          Sign in to create or join a household.
        </p>
        <Button onClick={() => openSignIn({})}>Sign in</Button>
      </main>
    );
  if (!ready)
    return (
      <main
        className="mx-auto w-full max-w-175 px-page-inline py-7"
        aria-busy="true"
      >
        Loading your household…
      </main>
    );
  return (
    <main className="mx-auto flex min-h-[70dvh] w-full max-w-175 flex-col gap-5 px-page-inline pt-7 pb-8">
      <ButtonLink
        href={
          invite
            ? `/household/join?token=${encodeURIComponent(invite)}`
            : "/week"
        }
        variant="inline"
        className="self-start"
      >
        Back
      </ButtonLink>
      <p className="text-12 font-bold tracking-label text-graphite uppercase">
        Household
      </p>
      <h1 className="font-display text-34 font-semibold tracking-title text-ink">
        {household ? "Your household" : "Share your week."}
      </h1>
      {household ? (
        <>
          <p className="text-16 leading-relaxed text-graphite">
            One shared week. Everyone can plan, shop and cook.
          </p>
          <ul className="border-t border-border">
            {household.members.map((member) => (
              <li
                key={member.userId}
                className="flex min-h-20 items-center gap-3 border-b border-border"
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-leaf-soft font-bold text-leaf">
                  {member.name.charAt(0)}
                </span>
                <span className="text-16 font-semibold">{member.name}</span>
              </li>
            ))}
          </ul>
          <ButtonLink href="/household/invite">Invite someone</ButtonLink>
          <ButtonLink
            href="/week"
            variant="secondary"
            onClick={() => {
              forgetInvite();
              select("household");
            }}
          >
            See our week
          </ButtonLink>
          <p className="text-14 leading-relaxed text-graphite">
            Switch between Household and Private anytime. Your saved recipes
            stay private.
          </p>
          <Button
            variant="inline"
            className="mt-auto self-start text-cadmium"
            onClick={() => setLeaving(true)}
          >
            Leave household
          </Button>
        </>
      ) : (
        <>
          <p className="text-16 leading-relaxed text-graphite">
            Create a household to plan meals, share the shopping and take turns
            cooking.
          </p>
          <div className="flex items-center gap-3.5 border-t border-border py-5">
            <CalendarDays className="size-6 shrink-0 text-leaf" />
            <div>
              <p className="text-15 font-bold">A copy of your current week</p>
              <p className="mt-1 text-14 text-graphite">
                Includes checked items and shopping extras.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3.5 border-b border-border pb-5">
            <UsersRound className="size-6 shrink-0 text-leaf" />
            <div>
              <p className="text-15 font-bold">Everyone can lend a hand</p>
              <p className="mt-1 text-14 text-graphite">
                Plan meals, tick the list, start cooking.
              </p>
            </div>
          </div>
          <p className="text-14 leading-relaxed text-graphite">
            Switch between Household and Private anytime. Your original week and
            saved recipes stay private.
          </p>
          <Button
            className="mt-auto"
            disabled={busy}
            onClick={() => void createHousehold()}
          >
            {busy ? "Creating…" : "Create household"}
          </Button>
          <p className="text-13 text-graphite">
            Next, invite someone with a link.
          </p>
        </>
      )}
      <Drawer open={leaving} onOpenChange={setLeaving}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle className="text-30">
              {last ? "Close this household?" : "Leave this household?"}
            </DrawerTitle>
          </DrawerHeader>
          <DrawerBody>
            <DrawerDescription className="text-15 leading-relaxed">
              {last
                ? "You’re the last person here. The household will close, and its shared plans and shopping lists will no longer be available. Shared changes won’t be copied to Private."
                : "You’ll lose access to this household’s plans and shopping lists. Everyone else can keep using them."}
            </DrawerDescription>
            <p className="mt-4 text-15 leading-relaxed text-graphite">
              Your private week and shopping list stay as they are.
            </p>
          </DrawerBody>
          <DrawerFooter className="flex flex-col gap-2">
            <Button disabled={busy} onClick={() => void leaveHousehold()}>
              {busy ? "Leaving…" : last ? "Close household" : "Leave household"}
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => setLeaving(false)}
            >
              Stay in household
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </main>
  );
}
