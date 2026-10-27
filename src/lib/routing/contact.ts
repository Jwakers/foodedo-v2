export function contactLink(
  native = process.env.NEXT_PUBLIC_CAPACITOR_BUILD === "true",
  webOrigin = process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    "https://www.foodedo.com",
) {
  return native
    ? {
        href: new URL("/support/contact", webOrigin).href,
        target: "_blank",
        rel: "noopener noreferrer",
      }
    : { href: "/support/contact" };
}
