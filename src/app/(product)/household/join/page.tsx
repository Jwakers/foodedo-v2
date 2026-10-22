import type { Metadata } from "next";
import { Suspense } from "react";
import { JoinHouseholdPage } from "@/features/household/join-household-page";
import { siteUrl } from "@/lib/seo/site-url";

const title = "You're invited to a Foodedo household";
const description =
  "Plan meals together and share a shopping list. Join your household on Foodedo.";
const image = {
  url: siteUrl("/images/social/household-invite.png"),
  width: 1200,
  height: 630,
  alt: "Join your household on Foodedo. Plan meals together and share a shopping list.",
};

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    type: "website",
    siteName: "Foodedo",
    title,
    description,
    images: [image],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [image],
  },
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default function Page() {
  return (
    <Suspense>
      <JoinHouseholdPage />
    </Suspense>
  );
}
