/** Editorial pages are hosted on the web and are not part of the iOS export. */
export function legalLink(
  path: "/privacy" | "/terms",
  native = process.env.NEXT_PUBLIC_CAPACITOR_BUILD === "true",
  webOrigin = process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    "https://www.foodedo.com",
) {
  return native
    ? {
        href: new URL(path, webOrigin).href,
        target: "_blank",
        rel: "noopener noreferrer",
      }
    : { href: path };
}
