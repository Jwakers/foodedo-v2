"use client";

import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { isAnalyticsOptedOut, setAnalyticsOptOut } from "@/lib/analytics";

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("foodedo:analytics-preference", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("foodedo:analytics-preference", callback);
  };
}

export function AnalyticsPreference() {
  const disabled = useSyncExternalStore(
    subscribe,
    isAnalyticsOptedOut,
    () => false,
  );
  return (
    <section
      aria-labelledby="analytics-preference"
      className="border-t border-border pt-6"
    >
      <h2
        id="analytics-preference"
        className="font-display text-26 font-semibold"
      >
        Product analytics
      </h2>
      <p className="mt-3 text-16 leading-7 text-graphite">
        When enabled, PostHog helps us understand visits, planning and returns
        to saved plans. We use its EU service with memory persistence, without
        recordings, recipe text, names or email addresses. First-visit
        attribution stays in this tab; save and return timestamps stay on this
        browser. Signing in links activity to your account ID. We respect Do Not
        Track. Your choice below applies to this browser.
      </p>
      <Button
        className="mt-4"
        variant="secondary"
        onClick={() => setAnalyticsOptOut(!disabled)}
      >
        {disabled ? "Allow product analytics" : "Turn off product analytics"}
      </Button>
      <p role="status" className="mt-2 text-14 text-graphite">
        {disabled
          ? "Product analytics is turned off."
          : "Product analytics is allowed, unless Do Not Track is enabled."}
      </p>
    </section>
  );
}
