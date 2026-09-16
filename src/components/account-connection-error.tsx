"use client";

import { RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

export function AccountConnectionError({
  embedded = false,
}: {
  embedded?: boolean;
}) {
  return (
    <section
      aria-labelledby="account-connection-heading"
      className={cn(
        "mx-auto flex min-h-[45vh] w-full max-w-175 flex-col items-start justify-center py-10",
        !embedded && "px-page-inline",
      )}
    >
      <p className="text-12 font-bold tracking-overline text-cadmium uppercase">
        Account connection
      </p>
      <h1
        id="account-connection-heading"
        className="mt-2 font-display text-30 font-semibold tracking-title text-ink"
      >
        We couldn’t load your Foodedo account
      </h1>
      <p className="mt-2 max-w-120 text-15 leading-relaxed text-graphite">
        Check your connection and try again. Your saved plan is still safe.
      </p>
      <Button
        className="mt-5"
        onClick={() => {
          window.location.reload();
        }}
      >
        Try again
        <RotateCw aria-hidden="true" className="size-4" />
      </Button>
    </section>
  );
}
