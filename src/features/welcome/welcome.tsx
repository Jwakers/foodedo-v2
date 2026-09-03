"use client";

import { SignInButton } from "@clerk/react";
import { ArrowRight } from "lucide-react";
import Image from "next/image";

import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { useWelcomeSession } from "@/components/use-welcome-session";

const collageImages = [
  {
    src: "/images/welcome/pasta-bowl.jpg",
    alt: "Pasta bowl with creamy beef and mushrooms",
    className:
      "relative h-full min-h-39.5 w-[60.5%] shrink-0 overflow-hidden rounded-media",
    sizes: "212px",
  },
  {
    src: "/images/welcome/fish-tacos.jpg",
    alt: "Fish tacos with cabbage slaw and lime",
    className: "relative h-[75px] w-full overflow-hidden rounded-md",
    sizes: "130px",
  },
  {
    src: "/images/welcome/grilled-fish.jpg",
    alt: "Grilled fish with lemon and dill",
    className: "relative h-[75px] w-full overflow-hidden rounded-md",
    sizes: "130px",
  },
] as const;

/**
 * Transient signed-out entry state for `/`.
 * Guest-first activation — not onboarding, not an auth wall.
 */
export function Welcome() {
  const { enterGuestExperience } = useWelcomeSession();

  return (
    <main
      aria-labelledby="welcome-heading"
      className="mx-auto flex w-full max-w-175 flex-col pt-[env(safe-area-inset-top)]"
    >
      <div className="flex h-13 shrink-0 items-center px-page-inline">
        <BrandLogo />
      </div>

      <div className="flex flex-col gap-2.5 px-page-inline pt-4.5">
        <h1
          id="welcome-heading"
          className="font-display text-42 font-semibold tracking-tight text-ink"
        >
          Make food decisions easier.
        </h1>
        <p className="max-w-82.5 text-14 leading-5 text-graphite">
          Save meal plans, your own recipes and shopping lists—all in one place.
        </p>
      </div>

      <div className="px-page-inline pt-2.5">
        <div className="flex h-39.5 w-full gap-2 overflow-hidden rounded-lg">
          <div className={collageImages[0].className}>
            <Image
              src={collageImages[0].src}
              alt={collageImages[0].alt}
              fill
              priority
              sizes={collageImages[0].sizes}
              className="object-cover"
            />
          </div>
          <div className="flex min-w-32.5 w-[37%] shrink-0 flex-col gap-2">
            <div className={collageImages[1].className}>
              <Image
                src={collageImages[1].src}
                alt={collageImages[1].alt}
                fill
                priority
                sizes={collageImages[1].sizes}
                className="object-cover"
              />
            </div>
            <div className={collageImages[2].className}>
              <Image
                src={collageImages[2].src}
                alt={collageImages[2].alt}
                fill
                priority
                sizes={collageImages[2].sizes}
                className="object-cover"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2.5 px-page-inline pt-5 pb-6.5">
        <Button className="w-full" onClick={enterGuestExperience}>
          Try Foodedo
          <ArrowRight aria-hidden="true" className="size-4.5" />
        </Button>

        <SignInButton mode="modal">
          <Button variant="secondary" className="w-full">
            Sign in or create account
          </Button>
        </SignInButton>

        <p className="text-center text-12 leading-4 text-graphite">
          Try Foodedo now. Save everything later.
        </p>
      </div>
    </main>
  );
}
