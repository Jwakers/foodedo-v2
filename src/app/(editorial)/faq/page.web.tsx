import {
  PublicPage,
  publicPageMetadata,
} from "@/features/public-pages/public-page";

export const dynamic = "force-static";
export const metadata = publicPageMetadata("/faq");

export default function Page() {
  return <PublicPage path="/faq" />;
}
