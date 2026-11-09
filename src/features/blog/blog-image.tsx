"use client";

import Image, { type ImageProps } from "next/image";
import { sanityImageLoader } from "./sanity-image-loader";

// Keep the function prop inside a client boundary; article pages remain server
// components and Next/Image still supplies responsive srcsets and lazy loading.
export function BlogImage({
  alt,
  ...props
}: Omit<ImageProps, "loader" | "src"> & { src: string }) {
  return <Image {...props} alt={alt} loader={sanityImageLoader} />;
}
