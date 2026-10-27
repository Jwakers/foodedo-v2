import {
  PublicPage,
  publicPageMetadata,
} from "@/features/public-pages/public-page";

export const dynamic = "force-static";
export const metadata = publicPageMetadata("/household-meal-planning");

export default function Page() {
  return <PublicPage path="/household-meal-planning" />;
}
