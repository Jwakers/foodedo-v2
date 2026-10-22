import type { MetadataRoute } from "next";

function escapeXml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[character]!,
  );
}

export function sitemapResponse(entries: MetadataRoute.Sitemap): Response {
  const urls = entries
    .map(
      ({ url, lastModified }) =>
        `<url><loc>${escapeXml(url)}</loc>${lastModified ? `<lastmod>${new Date(lastModified).toISOString()}</lastmod>` : ""}</url>`,
    )
    .join("\n");
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`,
    { headers: { "Content-Type": "application/xml; charset=utf-8" } },
  );
}
