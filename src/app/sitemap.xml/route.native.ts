import { catalogueSitemap } from "@/lib/seo/catalogue-sitemap";
import { sitemapResponse } from "@/lib/seo/sitemap-response";

export const dynamic = "force-static";

export async function GET() {
  return sitemapResponse(await catalogueSitemap());
}
