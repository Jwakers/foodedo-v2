// Private editorial vocabulary, not a claim of authenticity or a consumer filter.
export const CUISINE_TAXONOMY_VERSION = "cuisines-v1";
export const CUISINES = [
  "british",
  "irish",
  "french",
  "italian",
  "spanish",
  "portuguese",
  "greek",
  "turkish",
  "german",
  "russian",
  "scandinavian",
  "eastern-european",
  "indian",
  "pakistani",
  "sri-lankan",
  "chinese",
  "japanese",
  "korean",
  "thai",
  "vietnamese",
  "malaysian",
  "indonesian",
  "filipino",
  "lebanese",
  "persian",
  "moroccan",
  "ethiopian",
  "west-african",
  "east-african",
  "south-african",
  "american",
  "mexican",
  "caribbean",
  "brazilian",
  "peruvian",
  "mediterranean",
  "middle-eastern",
  "north-african",
  "south-asian",
  "southeast-asian",
  "latin-american",
] as const;
export type Cuisine = (typeof CUISINES)[number];

export function normaliseCuisines(values: readonly string[]): Cuisine[] {
  if (values.length > 8)
    throw new Error("Use at most eight cuisine influences.");
  return [
    ...new Set(
      values.map((value) => {
        const slug = value.trim().toLowerCase().replace(/[ _]+/g, "-");
        if (!(CUISINES as readonly string[]).includes(slug))
          throw new Error(
            `Unknown cuisine: ${value}. Use the editorial vocabulary or an empty list.`,
          );
        return slug as Cuisine;
      }),
    ),
  ].sort();
}

export const CUISINE_POLICY = `Cuisine vocabulary (${CUISINE_TAXONOMY_VERSION}): ${CUISINES.join(", ")}.
Use only these lowercase slugs for cuisines. Normally choose one; choose multiple only for distinct, meaningful fusion influences. Infer from the complete dish's technique and flavour, never a single ingredient. Prefer a specific cuisine to its regional fallback; do not add an umbrella label alongside its specific cuisine. Broader labels are fallbacks for genuine regional influence without a defensible specific attribution. Do not invent a fusion label. Use [] when uncertain or when none fits. These are editorial influences, not authenticity claims.`;
