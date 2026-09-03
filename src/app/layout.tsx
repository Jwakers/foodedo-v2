import type { Metadata, Viewport } from "next";
import { DM_Sans, Fraunces } from "next/font/google";
import type { ReactNode } from "react";
import { AppHeader } from "@/components/app-header";
import { AppNavigation } from "@/components/app-navigation";
import { AppProviders } from "@/components/app-providers";
import { foodedoColors } from "@/lib/design-system/tokens";
import { cn } from "@/lib/utils/cn";
import "./globals.css";

const displayFont = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
});

const uiFont = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Foodedo",
  description:
    "A decision-making engine for food. Foodedo should think so you don't have to.",
  applicationName: "Foodedo",
  appleWebApp: {
    capable: true,
    title: "Foodedo",
    statusBarStyle: "default",
  },
  icons: {
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: foodedoColors.paper,
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en-GB"
      className={cn(
        displayFont.variable,
        uiFont.variable,
        "h-full antialiased",
      )}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <AppProviders>
          <div className="flex min-h-full flex-1 flex-col">
            <AppHeader />
            <div className="flex-1 pb-[calc(4rem+env(safe-area-inset-bottom))] sm:pb-0">
              {children}
            </div>
            <AppNavigation placement="dock" />
          </div>
        </AppProviders>
      </body>
    </html>
  );
}
