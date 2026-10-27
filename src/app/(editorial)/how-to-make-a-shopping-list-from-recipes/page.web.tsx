import {
  PublicPage,
  publicPageMetadata,
} from "@/features/public-pages/public-page";

export const dynamic = "force-static";
export const metadata = publicPageMetadata(
  "/how-to-make-a-shopping-list-from-recipes",
);

export default function Page() {
  return <PublicPage path="/how-to-make-a-shopping-list-from-recipes" />;
}
