import { blogSitemap } from "@/features/blog/sitemap.server";
import { sitemapResponse } from "@/lib/seo/sitemap-response";

export const dynamic = "force-static";
export const revalidate = 60;

export async function GET() {
  return sitemapResponse(await blogSitemap());
}
