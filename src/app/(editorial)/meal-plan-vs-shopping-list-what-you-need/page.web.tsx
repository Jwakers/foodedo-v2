import {
  PublicPage,
  publicPageMetadata,
} from "@/features/public-pages/public-page";

export const dynamic = "force-static";
export const metadata = publicPageMetadata(
  "/meal-plan-vs-shopping-list-what-you-need",
);

export default function Page() {
  return <PublicPage path="/meal-plan-vs-shopping-list-what-you-need" />;
}
