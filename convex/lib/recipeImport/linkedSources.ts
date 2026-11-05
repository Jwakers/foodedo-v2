"use node";
import type { RecipeSourceCandidate } from "./source";

export function extractHttpLinks(text: string) {
  const candidates =
    text.match(/(?<![\w@.])(?:https?:\/\/|www\.)[^\s<>]+/gi) ?? [];
  const seen = new Set<string>();
  const links: string[] = [];
  for (const raw of candidates) {
    let trimmed = (
      raw.toLowerCase().startsWith("www.") ? `https://${raw}` : raw
    ).replace(/[.,;!?]+$/, "");
    // Keep balanced parentheses in real recipe slugs, remove prose punctuation.
    while (
      trimmed.endsWith(")") &&
      (trimmed.match(/\)/g)?.length ?? 0) > (trimmed.match(/\(/g)?.length ?? 0)
    ) {
      trimmed = trimmed.slice(0, -1);
    }
    try {
      const url = new URL(trimmed);
      if (!["https:", "http:"].includes(url.protocol)) continue;
      // YouTube sometimes wraps outgoing links. Unwrap without fetching YouTube.
      if (
        (["www.youtube.com", "youtube.com"].includes(url.hostname) &&
          url.pathname === "/redirect") ||
        url.hostname === "l.instagram.com"
      ) {
        const target =
          url.searchParams.get("u") ??
          url.searchParams.get("q") ??
          url.searchParams.get("url");
        if (!target) continue;
        const resolved = new URL(target);
        if (!["https:", "http:"].includes(resolved.protocol)) continue;
        trimmed = resolved.toString();
      } else trimmed = url.toString();
      const canonical = new URL(trimmed);
      canonical.hash = "";
      if (seen.has(canonical.toString())) continue;
      seen.add(canonical.toString());
      links.push(trimmed);
      if (links.length >= 40) break;
    } catch {
      continue;
    }
  }
  return links;
}

const excludedHosts = [
  "youtube.com",
  "youtu.be",
  "instagram.com",
  "tiktok.com",
  "facebook.com",
  "twitter.com",
  "x.com",
  "pinterest.com",
  "patreon.com",
  "amazon.com",
  "amazon.co.uk",
  "amzn.to",
  "google.com",
  "googleusercontent.com",
];

function linkLabel(description: string, link: string) {
  for (const line of description.split(/\r?\n/)) {
    let labelStart = 0;
    for (const match of line.matchAll(
      /(?<![\w@.])(?:https?:\/\/|www\.)[^\s<>]+/gi,
    )) {
      if (extractHttpLinks(match[0]).includes(link)) {
        return line.slice(labelStart, match.index);
      }
      labelStart = match.index + match[0].length;
    }
  }
  return "";
}

/** Rank all description links before applying the fetch cap; sponsor links may come first. */
export function rankedRecipeLinks(description: string, limit = 3): string[] {
  return extractHttpLinks(description)
    .map((link, index) => {
      const url = new URL(link);
      const host = url.hostname.toLowerCase().replace(/\.$/, "");
      if (
        excludedHosts.some(
          (excluded) => host === excluded || host.endsWith(`.${excluded}`),
        )
      )
        return null;
      const label = linkLabel(description, link);
      const score =
        (/\b(?:full |written |printable )?recipe\b/i.test(label) ? 8 : 0) +
        (/\/recipes?\//i.test(url.pathname) ? 4 : 0) +
        (url.pathname !== "/" ? 1 : 0) -
        (/\b(?:shop|sponsor|merch|equipment|newsletter|all recipes)\b/i.test(
          label,
        )
          ? 12
          : 0);
      return { link, score, index };
    })
    .filter((item) => item !== null)
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map(({ link }) => link);
}

export function hasRecipeEvidence(candidate: RecipeSourceCandidate) {
  // Acquisition signals only. The shared AI pipeline still decides completeness.
  return candidate.blocks.some(
    (block) =>
      (block.kind === "structured" &&
        /\.recipe(?:Ingredient|Instructions)(?:\[|\.|$)/.test(
          block.path ?? "",
        )) ||
      (/^h[1-6]\b/i.test(block.path ?? "") &&
        /^(?:ingredients|what you(?:’|')ll need|method|instructions|directions)\b/i.test(
          block.text,
        )) ||
      /^(?:ingredients|what you(?:’|')ll need|method|instructions|directions)\s*:?\s*$/im.test(
        block.text,
      ),
  );
}

/** Written content referenced outside the fetched caption is not evidence of video-only content. */
export function hasUnresolvedRecipeReference(text: string) {
  return /\b(?:links? in (?:my |the )?bio|recipe in (?:the )?(?:comments?|bio)|comment.{0,40}(?:recipe|link)|(?:recipe|link).{0,40}\b(?:dm|direct message)\b)/i.test(
    text,
  );
}
