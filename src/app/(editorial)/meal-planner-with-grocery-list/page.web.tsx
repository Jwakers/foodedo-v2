import {
  PublicPage,
  publicPageMetadata,
} from "@/features/public-pages/public-page";

export const dynamic = "force-static";
export const metadata = publicPageMetadata("/meal-planner-with-grocery-list");

export default function Page() {
  return <PublicPage path="/meal-planner-with-grocery-list" />;
}
