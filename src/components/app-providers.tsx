"use client";

import { ClerkProvider, useAuth } from "@clerk/react";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import type { ReactNode } from "react";
import { capacitorClerkOAuthTransport } from "@/lib/platform/capacitor/clerk-oauth-transport";

const clerkPublishableKey =
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim();
const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL?.trim();
const convexClient = convexUrl ? new ConvexReactClient(convexUrl) : null;
const isCapacitorBuild = process.env.NEXT_PUBLIC_CAPACITOR_BUILD === "true";

export function AppProviders({ children }: { children: ReactNode }) {
  if (!clerkPublishableKey || !convexClient) {
    return children;
  }

  return (
    <ClerkProvider
      publishableKey={clerkPublishableKey}
      __internal_oauthTransport={
        isCapacitorBuild ? capacitorClerkOAuthTransport : undefined
      }
    >
      <ConvexProviderWithClerk client={convexClient} useAuth={useAuth}>
        {children}
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}
