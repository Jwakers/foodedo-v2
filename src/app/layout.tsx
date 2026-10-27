import type { Metadata, Viewport } from "next";
import { DM_Sans, Fraunces } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import type { ReactNode } from "react";
import guides from "@/features/blog/guides.json";
import publicPages from "@/features/public-pages/pages.json";
import { AnalyticsProvider } from "@/components/analytics-provider";
import { foodedoColors } from "@/lib/design-system/tokens";
import { cn } from "@/lib/utils/cn";
import "./globals.css";

const analyticsGuidePaths = [
  ...guides.map((guide) => `/blog/${guide.slug}`),
  ...publicPages
    .filter((page) => page.kind === "guide")
    .map((page) => page.path),
];

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

const isCapacitorBuild = process.env.NEXT_PUBLIC_CAPACITOR_BUILD === "true";

export const viewport: Viewport = {
  themeColor: foodedoColors.paper,
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Native shell only: prevent iOS focus-zoom traps. The website stays zoomable.
  ...(isCapacitorBuild ? { maximumScale: 1, userScalable: false } : {}),
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
        {isCapacitorBuild ? (
          children
        ) : (
          <AnalyticsProvider guidePaths={analyticsGuidePaths}>
            {children}
          </AnalyticsProvider>
        )}
        {!isCapacitorBuild && <Analytics />}
      </body>
    </html>
  );
}
