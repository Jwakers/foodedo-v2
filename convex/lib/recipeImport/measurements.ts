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
  if (measure.unit === "kg") return { value: measure.value * 1000, unit: "g" };
  if (measure.unit === "l") return { value: measure.value * 1000, unit: "ml" };
  if (measure.unit !== "lb" && measure.unit !== "oz") return measure;
  const grams =
    measure.value * (measure.unit === "lb" ? 453.59237 : 28.349523125);
  return { value: Number(grams.toPrecision(3)), unit: "g" };
}

function preferredMeasure(primary: Measure, equivalents: Measure[]): Measure {
  const publishedMetric = [primary, ...equivalents].find((measure) =>
    ["g", "kg", "ml", "l"].includes(measure.unit ?? ""),
  );
  const selected = metricMeasure(publishedMetric ?? primary);
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
      const convertedQualifier =
        amount.qualifier && measure.unit !== amount.unit;
      const display = [
        numberText(measure.value),
        convertedQualifier ? null : amount.qualifier,
        measure.unit,
      ]
        .filter(Boolean)
        .join(" ");
      return {
        quantity: numberText(measure.value),
        ...(measure.unit ? { unit: measure.unit } : {}),
        amountText: convertedQualifier
          ? `${display} (${[numberText(amount.value), amount.qualifier, amount.unit].filter(Boolean).join(" ")})`
          : display,
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
