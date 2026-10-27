import {
  PublicPage,
  publicPageMetadata,
} from "@/features/public-pages/public-page";

export const dynamic = "force-static";
export const metadata = publicPageMetadata("/support/how-to-use");

export default function Page() {
  return <PublicPage path="/support/how-to-use" />;
}
