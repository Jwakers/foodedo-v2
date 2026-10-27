import {
  PublicPage,
  publicPageMetadata,
} from "@/features/public-pages/public-page";

export const dynamic = "force-static";
export const metadata = publicPageMetadata(
  "/combine-recipes-into-one-grocery-list",
);

export default function Page() {
  return <PublicPage path="/combine-recipes-into-one-grocery-list" />;
}
