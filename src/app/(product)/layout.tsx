import type { ReactNode } from "react";
import { AppProviders } from "@/components/app-providers";
import { AppShell } from "@/components/app-shell";

export default function ProductLayout({ children }: { children: ReactNode }) {
  return (
    <AppProviders>
      <AppShell>{children}</AppShell>
    </AppProviders>
  );
}
