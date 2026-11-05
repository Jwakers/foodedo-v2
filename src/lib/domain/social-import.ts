/** Acquisition facts only: these must never assert what an unread video contains. */
export type SocialImportPlatform = "youtube" | "instagram" | "tiktok";
export type SocialSourceEvidence = {
  platform: SocialImportPlatform;
  mediaType: "video" | "image" | "carousel";
  captionComplete: boolean;
  linkedContentUnavailable: boolean;
};

export function socialImportPlatform(
  rawUrl: string | undefined,
): SocialImportPlatform | undefined {
  if (!rawUrl) return;
  try {
    const host = new URL(rawUrl).hostname.toLowerCase().replace(/\.$/, "");
    if (
      ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"].includes(
        host,
      )
    )
      return "youtube";
    if (
      ["instagram.com", "www.instagram.com", "m.instagram.com"].includes(host)
    )
      return "instagram";
    if (host === "tiktok.com" || host.endsWith(".tiktok.com")) return "tiktok";
  } catch {
    /* Invalid input is handled by the source validator. */
  }
}

export function instagramPostUrl(
  rawUrl: string,
): { url: string; shortcode: string; kind: "post" | "video" } | null {
  try {
    const url = new URL(rawUrl);
    if (
      socialImportPlatform(rawUrl) !== "instagram" ||
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.port ||
      url.pathname.startsWith("/share/")
    )
      return null;
    const match = url.pathname.match(
      /^\/(?:[a-zA-Z0-9._]+\/)?(p|reel|reels|tv)\/([a-zA-Z0-9_-]{5,64})\/?$/,
    );
    if (!match) return null;
    return {
      url: `https://www.instagram.com/${match[1] === "p" ? "p" : "reel"}/${match[2]}/`,
      shortcode: match[2],
      kind: match[1] === "p" ? "post" : "video",
    };
  } catch {
    return null;
  }
}

export function canClassifyVideoOnly(
  evidence: SocialSourceEvidence | undefined,
) {
  return (
    evidence?.mediaType === "video" &&
    evidence.captionComplete &&
    !evidence.linkedContentUnavailable
  );
}
