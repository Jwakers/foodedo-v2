"use node";

import { imageSize } from "image-size";

const minimumLongEdge = 800;
const minimumShortEdge = 400;
const minimumPixels = 480_000;

export type ValidatedRecipeImage = {
  contentType: "image/jpeg" | "image/png" | "image/webp";
  width: number;
  height: number;
};

export function validateDownloadedRecipeImage(
  bytes: Uint8Array,
  declaredContentType: string | undefined,
): ValidatedRecipeImage | null {
  const contentType = sniffImageContentType(bytes);
  if (
    !contentType ||
    (declaredContentType && declaredContentType !== contentType)
  ) {
    return null;
  }
  let dimensions: ReturnType<typeof imageSize>;
  try {
    dimensions = imageSize(bytes);
  } catch {
    return null;
  }
  const { width, height } = dimensions;
  if (!width || !height) return null;
  const longEdge = Math.max(width, height);
  const shortEdge = Math.min(width, height);
  if (
    longEdge < minimumLongEdge ||
    shortEdge < minimumShortEdge ||
    width * height < minimumPixels
  ) {
    return null;
  }
  return { contentType, width, height };
}

function sniffImageContentType(
  bytes: Uint8Array,
): ValidatedRecipeImage["contentType"] | null {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}
