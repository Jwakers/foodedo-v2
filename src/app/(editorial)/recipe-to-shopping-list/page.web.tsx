import {
  PublicPage,
  publicPageMetadata,
} from "@/features/public-pages/public-page";

export const dynamic = "force-static";
export const metadata = publicPageMetadata("/recipe-to-shopping-list");

export default function Page() {
  return <PublicPage path="/recipe-to-shopping-list" />;
}
