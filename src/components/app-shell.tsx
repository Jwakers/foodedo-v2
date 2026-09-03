"use client";

import type { ReactNode } from "react";

import { AppHeader } from "@/components/app-header";
import { AppNavigation } from "@/components/app-navigation";
import { useShowAppChrome } from "@/components/use-home-entry-state";
import { cn } from "@/lib/utils/cn";

export function AppShell({ children }: { children: ReactNode }) {
  const showChrome = useShowAppChrome();

  return (
    <div className="flex min-h-full flex-1 flex-col">
      {showChrome ? <AppHeader /> : null}
      <div
        className={cn(
          "flex-1",
          showChrome && "pb-(--app-nav-height)",
        )}
      >
        {children}
      </div>
      {showChrome ? <AppNavigation /> : null}
    </div>
  );
}
