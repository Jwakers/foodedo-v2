import type { ImageLoaderProps } from "next/image";

/** Resize at Sanity's CDN instead of sending the result through Vercel again. */
export function sanityImageLoader({ src, width, quality }: ImageLoaderProps) {
  const url = new URL(src);
  if (url.protocol !== "https:" || url.hostname !== "cdn.sanity.io") {
    throw new Error("Blog images must use the Sanity image CDN.");
  }

  // The URL builder has already resolved editorial crops/hotspots into `rect`.
  // Scale both output dimensions to preserve index-card crops at every width.
  const originalWidth = Number(url.searchParams.get("w"));
  const originalHeight = Number(url.searchParams.get("h"));
  if (originalWidth > 0 && originalHeight > 0) {
    url.searchParams.set(
      "h",
      String(Math.max(1, Math.round((width * originalHeight) / originalWidth))),
    );
  }
  url.searchParams.set("w", String(width));
  url.searchParams.set("q", String(quality ?? 75));
  url.searchParams.set("auto", "format");
  return url.toString();
}
