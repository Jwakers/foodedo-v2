import type * as cheerio from "cheerio";
import { rankRecipeImages } from "../../../src/lib/domain/recipe-import";
export function selectSourceImages(
  $: ReturnType<typeof cheerio.load>,
  structuredImage: unknown,
  metadataImage: string | undefined,
  baseUrl: string,
) {
  const candidates: Parameters<typeof rankRecipeImages>[0] = [];
  for (const candidate of collectStructuredImageCandidates(structuredImage)) {
    const url = resolvePublicPageUrl(candidate.url, baseUrl);
    if (!url) continue;
    candidates.push({ ...candidate, url, source: "structured" });
  }

  const resolvedMetadataImage = resolvePublicPageUrl(metadataImage, baseUrl);
  if (resolvedMetadataImage) {
    candidates.push({
      url: resolvedMetadataImage,
      source: "metadata",
      alt: optionalString(
        $('meta[property="og:image:alt"]').attr("content") ??
          $('meta[name="twitter:image:alt"]').attr("content"),
      ),
      width: parsePositiveInteger(
        $('meta[property="og:image:width"]').attr("content"),
      ),
      height: parsePositiveInteger(
        $('meta[property="og:image:height"]').attr("content"),
      ),
    });
  }

  $("article img, main img, .entry-content img, .post-content img, .recipe img")
    .slice(0, 30)
    .each((_, element) => {
      const image = $(element);
      const width = parsePositiveInteger(image.attr("width"));
      const height = parsePositiveInteger(image.attr("height"));
      const context = [
        image.attr("class"),
        image.attr("data-pin-url"),
        image.parent().attr("class"),
        image.closest("figure").attr("class"),
      ]
        .filter(Boolean)
        .join(" ");
      const urls = [
        image.attr("src"),
        image.attr("data-src"),
        image.attr("data-lazy-src"),
        largestSrcsetUrl(image.attr("srcset") ?? image.attr("data-srcset")),
      ];
      for (const rawUrl of urls) {
        const url = resolvePublicPageUrl(rawUrl, baseUrl);
        if (url) {
          candidates.push({
            url,
            source: "visible",
            width,
            height,
            alt: optionalString(image.attr("alt")),
            context,
          });
        }
      }
    });

  const ranked = rankRecipeImages(candidates, 3).map(
    (candidate) => candidate.url,
  );
  return ranked.length > 0 ? ranked : undefined;
}

function collectStructuredImageCandidates(value: unknown): Array<{
  url: string;
  width?: number;
  height?: number;
  alt?: string;
}> {
  if (typeof value === "string") return [{ url: value }];
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectStructuredImageCandidates(item));
  }
  if (!value || typeof value !== "object") return [];
  const object = value as Record<string, unknown>;
  const url = object.url ?? object.contentUrl;
  if (typeof url !== "string") return [];
  return [
    {
      url,
      width: parsePositiveInteger(object.width),
      height: parsePositiveInteger(object.height),
      alt:
        typeof object.caption === "string"
          ? object.caption
          : typeof object.description === "string"
            ? object.description
            : undefined,
    },
  ];
}

function largestSrcsetUrl(value: string | undefined) {
  if (!value) return undefined;
  let largest: { url: string; width: number } | undefined;
  for (const candidate of value.split(",")) {
    const [url, descriptor] = candidate.trim().split(/\s+/, 2);
    const width = Number(descriptor?.replace(/w$/, ""));
    if (!url || !Number.isFinite(width) || width <= 0) continue;
    if (!largest || width > largest.width) largest = { url, width };
  }
  return largest?.url;
}

function parsePositiveInteger(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : undefined;
}

function resolvePublicPageUrl(value: unknown, baseUrl: string) {
  if (typeof value !== "string" || !value.trim()) return undefined;
  try {
    const url = new URL(value, baseUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    url.hash = "";
    return url.toString();
  } catch {
    return undefined;
  }
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
