import Link from "next/link";
import type { ReactNode } from "react";
import { AppNavigation } from "./app-navigation";
import { AuthControls } from "./auth-controls";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex min-h-20 w-full max-w-6xl items-center justify-between gap-5 px-5 pt-[env(safe-area-inset-top)] sm:px-8 lg:px-12">
          <Link
            href="/"
            className="font-display text-[1.75rem] font-semibold tracking-[-0.045em] text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
          >
            Foodedo
          </Link>

          <div className="flex items-center gap-4 sm:gap-8">
            <AppNavigation placement="header" />
            <AuthControls />
          </div>
        </div>
      </header>

      <div className="flex flex-1 flex-col">{children}</div>
      <AppNavigation placement="dock" />
    </div>
  );
}
