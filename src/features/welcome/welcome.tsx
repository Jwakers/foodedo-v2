"use client";

import { SignInButton } from "@clerk/react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWelcomeSession } from "@/components/use-welcome-session";
import { WelcomeContent } from "./welcome-content";

export function Welcome() {
  const { enterGuestExperience } = useWelcomeSession();
  return (
    <WelcomeContent
      actions={
        <>
          <Button className="w-full" onClick={enterGuestExperience}>
            Try Foodedo
            <ArrowRight aria-hidden="true" className="size-4.5" />
          </Button>

          <SignInButton mode="modal">
            <Button variant="secondary" className="w-full">
              Sign in or create account
            </Button>
          </SignInButton>
        </>
      }
    />
  );
}
