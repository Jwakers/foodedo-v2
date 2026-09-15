"use client";

import { Toaster } from "sonner";

export function AppToaster({ dockVisible }: { dockVisible: boolean }) {
  const bottomOffset = dockVisible
    ? "calc(var(--app-nav-height) + var(--space-3))"
    : "calc(env(safe-area-inset-bottom) + var(--space-4))";

  return (
    <Toaster
      position="bottom-center"
      offset={{ bottom: bottomOffset }}
      mobileOffset={{ bottom: bottomOffset }}
      closeButton
      toastOptions={{
        duration: 5_000,
        classNames: {
          toast:
            "font-ui rounded-surface border border-border bg-paper text-ink shadow-lg",
          title: "text-14 font-bold",
          description: "text-13 text-graphite",
          actionButton: "bg-ink text-paper",
          cancelButton: "bg-mist text-ink",
          closeButton: "border-border bg-paper text-ink",
        },
      }}
    />
  );
}
