import type { Metadata } from "next";
import { HomeEntry } from "@/features/welcome/home-entry";
import { siteUrl } from "@/lib/seo/site-url";

const title = "Foodedo · Meal planning and shopping lists";
const description =
  "Make food decisions easier. Try suggested dinner plans, keep your recipes and get a shopping list linked to your saved plan.";
const image = {
  url: siteUrl("/images/social/homepage-fish-tacos.jpg"),
  width: 1200,
  height: 630,
  alt: "Fish tacos with cabbage slaw and avocado on Foodedo",
};

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: siteUrl() },
  openGraph: {
    title,
    description,
    url: siteUrl(),
    siteName: "Foodedo",
    type: "website",
    locale: "en_GB",
    images: [image],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [image],
  },
};

export default function Home() {
  return <HomeEntry />;
}
