export function contactLink(
  native = process.env.NEXT_PUBLIC_CAPACITOR_BUILD === "true",
  webOrigin = process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    "https://www.foodedo.com",
  userId?: string | null,
) {
  const hosted = new URL("/support/contact", webOrigin);
  if (native && userId)
    hosted.hash = new URLSearchParams({ supportUserId: userId }).toString();
  return native
    ? {
        href: hosted.href,
        target: "_blank",
        rel: "noopener noreferrer",
      }
    : { href: "/support/contact" };
}
