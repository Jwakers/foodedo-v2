"use client";

import {
  ClerkFailed,
  ClerkLoaded,
  ClerkLoading,
  Show,
  SignInButton,
} from "@clerk/react";
import { ArrowRight, Check } from "lucide-react";
import Image from "next/image";

import { Button } from "@/components/ui/button";

export function Dashboard() {
  return (
    <section
      aria-labelledby="dashboard-heading"
      className="mx-auto w-full max-w-175"
    >
      <DashboardIntroduction />
      <DashboardImage />
      <AccountNotice />
      <DashboardModulePlaceholder />
    </section>
  );
}

function DashboardIntroduction() {
  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-12 font-bold tracking-overline text-cadmium uppercase">
        Your week
      </p>
      <h1
        id="dashboard-heading"
        className="font-display text-42 font-semibold tracking-display text-ink"
      >
        Dinner, decided.
      </h1>
      <p className="max-w-136 text-16 leading-relaxed text-graphite">
        One clear place for the next useful food decision.
      </p>
    </div>
  );
}

function DashboardImage() {
  return (
    <div className="relative mt-6 h-52 overflow-hidden rounded-hero sm:h-72">
      <Image
        src="/images/recipes/fish-tacos.jpg"
        alt="Crisp fish tacos with cabbage, lime and fresh herbs"
        fill
        priority
        sizes="(min-width: 640px) 700px, calc(100vw - 36px)"
        className="object-cover"
      />
    </div>
  );
}

function AccountNotice() {
  return (
    <>
      <ClerkLoading>
        <div
          className="mt-4 h-19 rounded-surface bg-mist"
          aria-label="Checking account status"
        />
      </ClerkLoading>

      <ClerkFailed>
        <p className="mt-4 rounded-surface bg-cadmium-soft p-4 text-13 text-danger">
          Account status is temporarily unavailable.
        </p>
      </ClerkFailed>

      <ClerkLoaded>
        <Show when="signed-out">
          <div className="mt-4 flex items-start gap-3 rounded-surface bg-leaf-soft p-4">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-leaf text-leaf-soft">
              <Check aria-hidden="true" className="size-4.5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-14 font-bold text-ink">
                Sign in when you want to save
              </p>
              <p className="mt-1 text-13 text-graphite">
                The dashboard itself stays the same; an account adds
                persistence.
              </p>
              <SignInButton mode="modal">
                <button
                  type="button"
                  className="mt-1 inline-flex min-h-9 items-center gap-1 text-13 font-bold text-leaf focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-leaf"
                >
                  Sign in
                  <ArrowRight aria-hidden="true" className="size-3.5" />
                </button>
              </SignInButton>
            </div>
          </div>
        </Show>
      </ClerkLoaded>
    </>
  );
}

function DashboardModulePlaceholder() {
  return (
    <div className="mt-5 rounded-surface border border-dashed border-control-muted p-5">
      <p className="text-12 font-bold tracking-overline text-graphite uppercase">
        Dashboard module
      </p>
      <h2 className="mt-2 font-display text-22 font-semibold text-ink">
        Ready for the next design pass
      </h2>
      <p className="mt-2 text-14 leading-5 text-graphite">
        Planning controls will be composed here from shared pieces.
      </p>
      <Button className="mt-5" disabled>
        Plan action placeholder
      </Button>
    </div>
  );
}
