import { siteUrl } from "@/lib/seo/site-url";

export const dynamic = "force-static";

export function GET() {
  return new Response(
    `User-agent: *\nAllow: /\nSitemap: ${siteUrl("/sitemap.xml")}\n`,
    { headers: { "Content-Type": "text/plain; charset=utf-8" } },
  );
}
