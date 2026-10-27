import {
  PublicPage,
  publicPageMetadata,
} from "@/features/public-pages/public-page";

export const dynamic = "force-static";
export const metadata = publicPageMetadata("/family-meal-planning");

export default function Page() {
  return <PublicPage path="/family-meal-planning" />;
}
