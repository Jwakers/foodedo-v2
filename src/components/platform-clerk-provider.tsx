"use client";

import { ClerkProvider, type ClerkProviderProps } from "@clerk/react";
import { useEffect, useState, type ReactNode } from "react";
import { HomeLoading } from "@/components/home-loading";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";

const isNative = process.env.NEXT_PUBLIC_CAPACITOR_BUILD === "true";

export function PlatformClerkProvider({
  publishableKey,
  children,
}: {
  publishableKey: string;
  children: ReactNode;
}) {
  return isNative ? (
    <NativeClerkProvider key={publishableKey} publishableKey={publishableKey}>
      {children}
    </NativeClerkProvider>
  ) : (
    <ClerkProvider publishableKey={publishableKey}>{children}</ClerkProvider>
  );
}

function NativeClerkProvider({
  publishableKey,
  children,
}: {
  publishableKey: string;
  children: ReactNode;
}) {
  const [options, setOptions] = useState<Partial<ClerkProviderProps> | null>(
    null,
  );
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void import("@/lib/platform/capacitor/clerk-native-client")
      .then((module) => module.nativeClerkOptions(publishableKey))
      .then((result) => {
        if (active) setOptions(result);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [publishableKey, attempt]);

  if (failed)
    return (
      <main className="mx-auto max-w-175 px-page-inline pt-[env(safe-area-inset-top)] pb-8">
        <div className="flex h-13.5 items-center">
          <BrandLogo />
        </div>
        <h1 className="mt-8 font-display text-30 font-semibold text-ink">
          Foodedo couldn’t start sign-in
        </h1>
        <p role="status" className="mt-3 text-15 text-graphite">
          Check your connection and that your iPhone is unlocked, then try
          again. Your saved data is kept.
        </p>
        <Button
          className="mt-6"
          onClick={() => {
            setFailed(false);
            setAttempt((value) => value + 1);
          }}
        >
          Try again
        </Button>
      </main>
    );
  if (!options) return <HomeLoading />;
  return (
    <ClerkProvider {...options} publishableKey={publishableKey}>
      {children}
    </ClerkProvider>
  );
}
