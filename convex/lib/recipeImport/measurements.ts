import { z } from "zod";

export const measurementUnitSchema = z.enum([
  "g",
  "kg",
  "ml",
  "l",
  "lb",
  "oz",
  "tsp",
  "tbsp",
  "cup",
  "piece",
  "clove",
  "slice",
  "can",
  "tin",
  "packet",
  "bunch",
  "head",
  "sprig",
  "stalk",
  "pinch",
  "dash",
  "handful",
]);
const valueSchema = z.number().positive().max(1_000_000);
const measureSchema = z.object({
  value: valueSchema,
  unit: measurementUnitSchema.nullable(),
});
const qualifier = z
  .string()
  .max(80)
  .nullable()
  .describe(
    "Measurement qualifier only, such as heaped, level or packed. Ingredient sizes (large/medium/small) MUST remain in the ingredient name, never here.",
  );
export const amountSchema = z.union([
  z.object({
    kind: z.literal("exact"),
    value: valueSchema,
    unit: measurementUnitSchema.nullable(),
    qualifier,
    equivalents: z.array(measureSchema).max(4),
  }),
  z.object({
    kind: z.literal("range"),
    lower: valueSchema,
    upper: valueSchema,
    unit: measurementUnitSchema.nullable(),
    qualifier,
  }),
  z.object({
    kind: z.literal("package"),
    count: valueSchema,
    unit: z.enum(["can", "tin", "packet", "pack", "bottle", "jar"]),
    size: measureSchema,
    equivalents: z.array(measureSchema).max(4),
  }),
  z.object({
    kind: z.literal("qualitative"),
    text: z.string().min(1).max(120),
  }),
  z.object({ kind: z.literal("unspecified") }),
]);
export type ImportAmount = z.infer<typeof amountSchema>;
type Measure = z.infer<typeof measureSchema>;

/** Conversions use exact international avoirdupois factors; display rounds to 3 significant figures. */
export function metricMeasure(measure: Measure): Measure {
  if (measure.unit !== "lb" && measure.unit !== "oz") return measure;
  const grams =
    measure.value * (measure.unit === "lb" ? 453.59237 : 28.349523125);
  return { value: Number(grams.toPrecision(3)), unit: "g" };
}

function preferredMeasure(primary: Measure, equivalents: Measure[]): Measure {
  const publishedMetric = [primary, ...equivalents].find((measure) =>
    ["g", "kg", "ml", "l"].includes(measure.unit ?? ""),
  );
  const selected = publishedMetric ?? metricMeasure(primary);
  return selected.unit === "piece" ? { ...selected, unit: null } : selected;
}
function numberText(value: number) {
  return String(Number(value.toFixed(6)));
}
function measureText(measure: Measure) {
  return [numberText(measure.value), measure.unit].filter(Boolean).join(" ");
}

/** This is the only writer of durable amount strings for new imports. */
export function formatImportAmount(amount: ImportAmount): {
  quantity?: string;
  unit?: string;
  amountText?: string;
} {
  switch (amount.kind) {
    case "unspecified":
      return {};
    case "qualitative":
      return { amountText: amount.text.trim() };
    case "exact": {
      const measure = preferredMeasure(amount, amount.equivalents);
      return {
        quantity: numberText(measure.value),
        ...(measure.unit ? { unit: measure.unit } : {}),
        amountText: [numberText(measure.value), amount.qualifier, measure.unit]
          .filter(Boolean)
          .join(" "),
      };
    }
    case "range": {
      const unit = amount.unit === "piece" ? null : amount.unit;
      const lower = metricMeasure({ value: amount.lower, unit });
      const upper = metricMeasure({ value: amount.upper, unit });
      const quantity = `${numberText(lower.value)}–${numberText(upper.value)}`;
      return {
        quantity,
        ...(lower.unit ? { unit: lower.unit } : {}),
        amountText: [quantity, amount.qualifier, lower.unit]
          .filter(Boolean)
          .join(" "),
      };
    }
    case "package": {
      const size = preferredMeasure(amount.size, amount.equivalents);
      return {
        amountText: `${numberText(amount.count)} × ${measureText(size)} ${amount.unit}${amount.count === 1 ? "" : "s"}`,
      };
    }
  }
}

export function isScalableImportAmount(amount: ImportAmount): boolean {
  return (
    amount.kind === "exact" &&
    !amount.qualifier &&
    !["handful", "pinch", "dash", "packet", "can", "tin", "bunch"].includes(
      amount.unit ?? "",
    )
  );
}

const factors: Partial<Record<NonNullable<Measure["unit"]>, number>> = {
  g: 1,
  kg: 1000,
  oz: 28.349523125,
  lb: 453.59237,
  ml: 1,
  l: 1000,
};
function dimension(unit: Measure["unit"]) {
  if (unit === "piece") return null;
  if (["g", "kg", "lb", "oz"].includes(unit ?? "")) return "mass";
  if (["ml", "l"].includes(unit ?? "")) return "volume";
  return unit;
}
function sameMeasure(a: Measure, b: Measure) {
  if (dimension(a.unit) !== dimension(b.unit)) return false;
  const av = a.value * (a.unit ? (factors[a.unit] ?? 1) : 1);
  const bv = b.value * (b.unit ? (factors[b.unit] ?? 1) : 1);
  return Math.abs(av - bv) <= Math.max(0.00001, Math.abs(av) * 0.006);
}
const aliases: Record<string, NonNullable<Measure["unit"]>> = {
  grams: "g",
  gram: "g",
  kilograms: "kg",
  kilogram: "kg",
  pounds: "lb",
  pound: "lb",
  lbs: "lb",
  ounces: "oz",
  ounce: "oz",
  millilitres: "ml",
  milliliters: "ml",
  millilitre: "ml",
  milliliter: "ml",
  litres: "l",
  liters: "l",
  litre: "l",
  liter: "l",
  tablespoon: "tbsp",
  tablespoons: "tbsp",
  teaspoon: "tsp",
  teaspoons: "tsp",
  cups: "cup",
  cloves: "clove",
  cans: "can",
  tins: "tin",
  slices: "slice",
  packets: "packet",
  bunches: "bunch",
  heads: "head",
  sprigs: "sprig",
  stalks: "stalk",
};
function normalizedSource(text: string) {
  return (
    text
      // Separate mixed vulgar fractions before NFKC expands them (1½ -> 1 1/2).
      .replace(/([0-9])([¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])/g, "$1 $2")
      .normalize("NFKC")
      .replace(/⁄/g, "/")
      .toLowerCase()
      .replace(/\s+/g, " ")
  );
}
export function numericValue(text: string): number {
  const parts = text.trim().split(/\s+/);
  return parts.reduce((sum, part) => {
    const [a, b] = part.split("/").map(Number);
    return sum + (b ? a / b : a);
  }, 0);
}
/** Checks measurements, not exact spelling or numeric tokens. Semantic coverage is audited separately by AI. */
export type MeasurementEvidence = "supported" | "conflicting" | "inconclusive";
export function checkSourceAmount(
  amount: ImportAmount,
  source: string,
): MeasurementEvidence {
  if (amount.kind === "unspecified" || amount.kind === "qualitative")
    return "inconclusive";
  const text = normalizedSource(source);
  const quantities = [
    ...text.matchAll(
      /(\d+(?:\.\d+)?(?:\s+\d+\/\d+|\/\d+)?)\s*[-–]?\s*(?:(?:heaped|level|generous|rounded|scant|small|medium|large)\s+)?(kg|kilograms?|grams?|g|millilitres?|milliliters?|ml|litres?|liters?|l|lbs?|pounds?|oz|ounces?|tbsp|tablespoons?|tsp|teaspoons?|cups?|cloves?|cans?|tins?|slices?|packets?|bunches|heads?|sprigs?|stalks?)\b/g,
    ),
  ].map((match) => ({
    value: numericValue(match[1]),
    unit: (aliases[match[2]] ?? match[2]) as Measure["unit"],
  }));
  const leading = text.match(
    /^\s*(?:[-*•◦□▢☐☑]\s*|\d+[.)]\s+)?(\d+(?:\.\d+)?(?:\s+\d+\/\d+|\/\d+)?)/,
  );
  if (leading) quantities.push({ value: numericValue(leading[1]), unit: null });
  if (
    leading &&
    amount.kind === "exact" &&
    amount.unit &&
    !factors[amount.unit] &&
    !["tsp", "tbsp", "cup"].includes(amount.unit)
  ) {
    const words = text.split(/[^a-z]+/).map((word) => aliases[word] ?? word);
    if (words.includes(amount.unit))
      quantities.push({ value: numericValue(leading[1]), unit: amount.unit });
  }
  const checkMeasure = (measure: Measure): MeasurementEvidence =>
    quantities.some((candidate) => sameMeasure(measure, candidate))
      ? "supported"
      : quantities.some(
            (candidate) =>
              dimension(candidate.unit) === dimension(measure.unit),
          )
        ? "conflicting"
        : "inconclusive";
  const combine = (checks: MeasurementEvidence[]): MeasurementEvidence =>
    checks.includes("conflicting")
      ? "conflicting"
      : checks.includes("inconclusive")
        ? "inconclusive"
        : "supported";
  if (amount.kind === "exact")
    return combine([amount, ...amount.equivalents].map(checkMeasure));
  if (amount.kind === "package") {
    // "A 250-gram package" explicitly denotes one package, not 250 packages.
    // Only accept an article when a container noun is present; never infer a size.
    const articlePackage =
      /^\s*an?\s+/.test(text) &&
      /\b(?:package|packet|pack|can|tin|bottle|jar)\b/.test(text);
    const count = leading
      ? numericValue(leading[1])
      : articlePackage
        ? 1
        : undefined;
    return combine([
      count === undefined
        ? "inconclusive"
        : count === amount.count
          ? "supported"
          : "conflicting",
      ...[amount.size, ...amount.equivalents].map(checkMeasure),
    ]);
  }
  if (amount.lower > amount.upper) return "conflicting";
  const ranges = [
    ...text.matchAll(
      /(\d+(?:\.\d+)?(?:\s+\d+\/\d+|\/\d+)?)\s*(?:to|[-–—])\s*(\d+(?:\.\d+)?(?:\s+\d+\/\d+|\/\d+)?)\s*([a-z]+)?/g,
    ),
  ];
  const checks = ranges.map((range): MeasurementEvidence => {
    const unit = range[3] ? (aliases[range[3]] ?? range[3]) : null;
    // Words such as “cloves” are explicit count units; unrelated following words leave a unitless count.
    const parsed = measurementUnitSchema.safeParse(unit);
    const sourceUnit = parsed.success ? parsed.data : null;
    const supported =
      sameMeasure(
        { value: amount.lower, unit: amount.unit },
        { value: numericValue(range[1]), unit: sourceUnit },
      ) &&
      sameMeasure(
        { value: amount.upper, unit: amount.unit },
        { value: numericValue(range[2]), unit: sourceUnit },
      );
    return supported
      ? "supported"
      : parsed.success && dimension(sourceUnit) === dimension(amount.unit)
        ? "conflicting"
        : "inconclusive";
  });
  return checks.includes("supported")
    ? "supported"
    : checks.includes("conflicting")
      ? "conflicting"
      : "inconclusive";
}
