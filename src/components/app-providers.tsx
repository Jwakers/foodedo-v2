"use client";

import { AnalyticsIdentity } from "@/components/analytics-identity";
import { ClerkProvider, useAuth } from "@clerk/react";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import type { ReactNode } from "react";
import { capacitorClerkOAuthTransport } from "@/lib/platform/capacitor/clerk-oauth-transport";

import { OnboardingProvider } from "@/features/onboarding/use-onboarding";
import { HouseholdProvider } from "@/features/household/household-context";

const clerkPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY!;
const convexClient = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
const isCapacitorBuild = process.env.NEXT_PUBLIC_CAPACITOR_BUILD === "true";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider
      publishableKey={clerkPublishableKey}
      __internal_oauthTransport={
        isCapacitorBuild ? capacitorClerkOAuthTransport : undefined
      }
    >
      {!isCapacitorBuild && <AnalyticsIdentity />}
      <ConvexProviderWithClerk client={convexClient} useAuth={useAuth}>
        <OnboardingProvider>
          <HouseholdProvider>{children}</HouseholdProvider>
        </OnboardingProvider>
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}
