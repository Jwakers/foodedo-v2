"use client";

import { AccountSyncGate } from "@/features/auth/account-sync-gate";
import { AnalyticsIdentity } from "@/components/analytics-identity";
import { useAuth } from "@clerk/react";
import { PlatformClerkProvider } from "@/components/platform-clerk-provider";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import type { ReactNode } from "react";

import { OnboardingProvider } from "@/features/onboarding/use-onboarding";
import { AllergyProvider } from "@/features/allergies/allergy-context";
import { HouseholdProvider } from "@/features/household/household-context";

const clerkPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY!;
const convexClient = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
const isCapacitorBuild = process.env.NEXT_PUBLIC_CAPACITOR_BUILD === "true";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <PlatformClerkProvider publishableKey={clerkPublishableKey}>
      {!isCapacitorBuild && <AnalyticsIdentity />}
      <ConvexProviderWithClerk client={convexClient} useAuth={useAuth}>
        <AccountSyncGate>
          <OnboardingProvider>
            <HouseholdProvider>
              <AllergyProvider>{children}</AllergyProvider>
            </HouseholdProvider>
          </OnboardingProvider>
        </AccountSyncGate>
      </ConvexProviderWithClerk>
    </PlatformClerkProvider>
  );
}
