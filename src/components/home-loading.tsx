"use client";

import { useEffect, useState } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { Button, ButtonLink } from "@/components/ui/button";

/** Same presentation before auth, account, household and plan hydration. */
export function HomeLoading() {
  return (
    <main data-home-loading className="w-full pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex h-13.5 w-full max-w-175 items-center px-page-inline">
        <BrandLogo />
      </div>
      <div className="px-page-inline py-8 sm:px-8 sm:py-12">
        <HomeLoadingContent />
      </div>
    </main>
  );
}

export function HomeLoadingContent() {
  const [isDelayed, setIsDelayed] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setIsDelayed(true), 10_000);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <section
      aria-label="Loading Foodedo"
      aria-busy={!isDelayed}
      className="mx-auto w-full max-w-175"
    >
      {isDelayed ? (
        <>
          <div role="status">
            <h1 className="font-display text-30 font-semibold tracking-title text-ink">
              Foodedo is taking a little longer
            </h1>
            <p className="mt-3 max-w-120 text-15 leading-relaxed text-graphite">
              Check your connection and try again, or browse recipes. Any
              unsaved plan on this device will be kept.
            </p>
          </div>
          <div className="mt-6 flex max-w-100 flex-col gap-3">
            <Button onClick={() => window.location.reload()}>Try again</Button>
            <ButtonLink href="/recipes" variant="secondary">
              Browse recipes
            </ButtonLink>
          </div>
        </>
      ) : (
        <>
          <p role="status" className="sr-only">
            Loading Foodedo
          </p>
          <div aria-hidden="true">
            <div className="h-8 w-28 rounded-sm bg-mist" />
            <div className="mt-3 h-12 w-56 rounded-sm bg-mist" />
            <div className="mt-6 grid h-52 grid-cols-2 grid-rows-2 gap-2 overflow-hidden rounded-hero sm:h-72">
              {[0, 1, 2, 3].map((cell) => (
                <div key={cell} className="bg-mist" />
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
