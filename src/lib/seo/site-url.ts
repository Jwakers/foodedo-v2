export function siteUrl(path = "/"): string {
  const origin =
    process.env.SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    "https://www.foodedo.com";
  return new URL(path, origin).toString();
}
