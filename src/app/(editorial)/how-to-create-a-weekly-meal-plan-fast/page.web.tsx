import {
  PublicPage,
  publicPageMetadata,
} from "@/features/public-pages/public-page";

export const dynamic = "force-static";
export const metadata = publicPageMetadata(
  "/how-to-create-a-weekly-meal-plan-fast",
);

export default function Page() {
  return <PublicPage path="/how-to-create-a-weekly-meal-plan-fast" />;
}
