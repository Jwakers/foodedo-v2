"use client";

import { Capacitor } from "@capacitor/core";
import { Share } from "@capacitor/share";

const defaultWebOrigin = "https://foodedo.com";

export type RecipeShareResult = "shared" | "copied" | "cancelled" | "failed";

/**
 * Shares a public recipe URL with the native iOS sheet or the browser's share
 * sheet. The Web Share API fallback keeps desktop browsers useful too.
 */
export async function shareRecipe({
  title,
  path,
}: {
  title: string;
  path: string;
}): Promise<RecipeShareResult> {
  const url = recipeShareUrl(path);

  try {
    if (Capacitor.isNativePlatform()) {
      await Share.share({
        url,
        dialogTitle: `Share ${title}`,
      });
      return "shared";
    }

    if (navigator.share) {
      // Browser share-sheet Copy actions should leave a directly-pasteable URL.
      await navigator.share({ url });
      return "shared";
    }

    await navigator.clipboard.writeText(url);
    return "copied";
  } catch (error) {
    return isShareCancellation(error) ? "cancelled" : "failed";
  }
}

export function recipeShareUrl(path: string) {
  const origin = Capacitor.isNativePlatform()
    ? process.env.NEXT_PUBLIC_SITE_URL?.trim() || defaultWebOrigin
    : window.location.origin;

  return new URL(path, origin).toString();
}

function isShareCancellation(error: unknown) {
  if (error instanceof DOMException && error.name === "AbortError") return true;
  return error instanceof Error && /cancel(l)?ed/i.test(error.message);
}
