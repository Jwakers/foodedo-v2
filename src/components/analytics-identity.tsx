"use client";

import { useClerk } from "@clerk/react";
import { useEffect } from "react";
import { analyticsEnabled, identify, reset, track } from "@/lib/analytics";

const completedSessions = new Set<string>();

/** Clerk resource callbacks cover modal and OAuth completion without profile properties. */
export function AnalyticsIdentity() {
  const clerk = useClerk();
  useEffect(() => {
    function syncCurrentIdentity() {
      if (clerk.user && clerk.session) identify(clerk.user.id);
      else reset();
    }
    window.addEventListener(
      "foodedo:analytics-preference",
      syncCurrentIdentity,
    );
    const unsubscribe = clerk.addListener(({ session, user, client }) => {
      if (!user || !session) {
        reset();
        return;
      }
      identify(user.id);
      if (!analyticsEnabled()) return;
      const signedUp =
        client?.signUp.status === "complete" &&
        client.signUp.createdSessionId === session.id;
      const signedIn =
        client?.signIn.status === "complete" &&
        client.signIn.createdSessionId === session.id;
      if ((signedUp || signedIn) && !completedSessions.has(session.id)) {
        completedSessions.add(session.id);
        track(signedUp ? "signed_up" : "signed_in", {});
      }
    });
    return () => {
      unsubscribe();
      window.removeEventListener(
        "foodedo:analytics-preference",
        syncCurrentIdentity,
      );
    };
  }, [clerk]);
  return null;
}
