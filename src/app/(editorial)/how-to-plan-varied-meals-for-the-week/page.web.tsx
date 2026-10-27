import {
  PublicPage,
  publicPageMetadata,
} from "@/features/public-pages/public-page";

export const dynamic = "force-static";
export const metadata = publicPageMetadata(
  "/how-to-plan-varied-meals-for-the-week",
);

export default function Page() {
  return <PublicPage path="/how-to-plan-varied-meals-for-the-week" />;
}
