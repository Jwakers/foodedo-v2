"use client";

import type { ImageLoaderProps } from "next/image";

/** Share the web optimizer's responsive variants and HTTP cache with iOS. */
export default function nativeImageLoader({
  src,
  width,
  quality,
}: ImageLoaderProps): string {
  // Local photography ships in the app; blob/data previews need no server.
  if (!src.startsWith("https://")) return src;

  const origin =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://www.foodedo.com";
  const url = new URL("/_next/image", origin);
  url.searchParams.set("url", src);
  url.searchParams.set("w", String(width));
  url.searchParams.set("q", String(quality ?? 75));
  return url.toString();
}
