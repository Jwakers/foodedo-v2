export const RECIPE_IMPORT_INPUT_LIMITS = {
  urlCharacters: 2_048,
  textCharacters: 80_000,
  requestIdCharacters: 100,
  minimumTextCharacters: 20,
} as const;

export type RecipeImageCandidate = {
  url: string;
  source: "structured" | "metadata" | "visible";
  width?: number;
  height?: number;
  alt?: string;
  context?: string;
};

/**
 * Prefer a recipe's full-size source image over a plugin thumbnail. Schema.org
 * commonly lists generated thumbnails before its original image, so source
 * order alone is not a quality signal.
 */
export function selectBestRecipeImage(
  candidates: RecipeImageCandidate[],
): string | undefined {
  return rankRecipeImages(candidates, 1)[0]?.url;
}

export function rankRecipeImages(
  candidates: RecipeImageCandidate[],
  limit = 3,
): RecipeImageCandidate[] {
  const unique = new Map<string, RecipeImageCandidate>();
  for (const candidate of candidates) {
    const url = candidate.url.trim();
    if (!url) continue;
    const existing = unique.get(url);
    if (
      !existing ||
      imageCandidateScore(candidate) > imageCandidateScore(existing)
    ) {
      unique.set(url, { ...candidate, url });
    }
  }

  return [...unique.values()]
    .filter((candidate) => imageCandidateScore(candidate) > 0)
    .sort(
      (left, right) => imageCandidateScore(right) - imageCandidateScore(left),
    )
    .slice(0, Math.max(0, limit));
}

function imageCandidateScore(candidate: RecipeImageCandidate) {
  const dimensions = imageDimensions(candidate);
  const area = dimensions
    ? Math.min(dimensions.width * dimensions.height, 4_000_000)
    : 1_500_000;
  const sourceScore =
    candidate.source === "structured"
      ? 4_000_000
      : candidate.source === "metadata"
        ? 3_000_000
        : 0;
  const thumbnailPenalty =
    /(?:^|[-_/.])(thumb|thumbnail|small|medium|tiny)(?:[-_/.]|$)|[-_]\d{2,4}x\d{2,4}(?=\.[a-z]{2,5}(?:$|[?#]))/i.test(
      candidate.url,
    )
      ? 5_000_000
      : 0;
  const semanticText = [candidate.url, candidate.alt, candidate.context]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ");
  const nonRecipePenalty =
    /\b(?:avatar|author|bio|biography|founder|headshot|logo|membership|newsletter|portrait|profile|subscribe)\b/.test(
      semanticText,
    ) ||
    (/\b(?:face|man|person|woman)\b/.test(semanticText) &&
      /\b(?:camera|headshot|portrait|profile|smil(?:e|es|ing)|standing)\b/.test(
        semanticText,
      ))
      ? 8_000_000
      : 0;
  const tinyImagePenalty =
    dimensions && (dimensions.width < 320 || dimensions.height < 240)
      ? 5_000_000
      : 0;
  return (
    area + sourceScore - thumbnailPenalty - nonRecipePenalty - tinyImagePenalty
  );
}

function imageDimensions(candidate: RecipeImageCandidate) {
  if (candidate.width && candidate.height) {
    return { width: candidate.width, height: candidate.height };
  }
  const match = candidate.url.match(
    /[-_](\d{2,5})x(\d{2,5})(?=\.[a-z]{2,5}(?:$|[?#]))/i,
  );
  if (!match) return undefined;
  return { width: Number(match[1]), height: Number(match[2]) };
}

/** Reject every non-public IPv4 range and non-global IPv6 address. */
export function isPrivateOrReservedAddress(address: string) {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, "");
  const mappedIpv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (mappedIpv4) return isPrivateOrReservedAddress(mappedIpv4);

  if (normalized.includes(":")) {
    // Public IPv6 unicast currently lives in 2000::/3. Explicitly exclude the
    // documentation block even though it falls within that prefix.
    return (
      !/^[23][0-9a-f]{0,3}:/.test(normalized) ||
      normalized.startsWith("2001:db8:")
    );
  }

  const octets = normalized.split(".").map(Number);
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return true;
  }
  const [a, b, c] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113)
  );
}
