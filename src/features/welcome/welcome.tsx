"use client";

import { track } from "@/lib/analytics";
import { SignInButton } from "@clerk/react";
import { ArrowRight } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { WelcomeContent } from "./welcome-content";

export function Welcome() {
  return (
    <WelcomeContent
      actions={
        <>
          <ButtonLink
            href="/week/setup"
            className="w-full"
            onClick={() => {
              track("try_foodedo_clicked", {
                source_path: "/",
                cta_location: "landing_hero",
              });
            }}
          >
            Plan my week
            <ArrowRight aria-hidden="true" className="size-4.5" />
          </ButtonLink>

          <p className="text-center text-14 leading-5 text-graphite">
            No account needed to try. Sign in when you want to save your plan.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-1 text-14 text-graphite">
            <span>Already use Foodedo?</span>
            <SignInButton mode="modal">
              <Button
                variant="inline"
                className="min-h-11 px-2 text-14 underline underline-offset-4"
              >
                Sign in
              </Button>
            </SignInButton>
          </div>
        </>
      }
    />
  );
}
