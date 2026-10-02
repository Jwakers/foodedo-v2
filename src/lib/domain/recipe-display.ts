import type {
  RecipeIngredientLine,
  RecipeMetadataProvenance,
  RecipeSource,
} from "@/lib/domain/recipes";
import { normaliseImportedDisplayAmount } from "@/lib/domain/recipe-normalization";

/** Left column of an ingredient row: quantity + unit, or an em dash. */
export function formatIngredientAmount(line: RecipeIngredientLine): string {
  return normaliseImportedDisplayAmount(line) ?? "—";
}

/** The durable ingredient identity shown prominently in every recipe surface. */
export function formatIngredientName(line: RecipeIngredientLine): string {
  return line.name;
}

/** A quieter preparation, handling, or qualifier detail for an ingredient. */
export function formatIngredientNote(
  line: RecipeIngredientLine,
): string | undefined {
  const note = line.note?.trim();
  return note || undefined;
}

export function formatImportedMetadataNotice(source?: RecipeSource) {
  if (source?.type !== "import" || !source.metadataProvenance) return undefined;
  const inferred = metadataLabels(source.metadataProvenance, "derived");
  const estimated = metadataLabels(source.metadataProvenance, "estimated");
  const sentences = [
    inferred.length > 0
      ? `${sentenceCase(formatList(inferred))} inferred from the recipe.`
      : null,
    estimated.length > 0
      ? `${sentenceCase(formatList(estimated))} estimated from the recipe.`
      : null,
  ].filter((sentence): sentence is string => sentence !== null);
  return sentences.join(" ") || undefined;
}

function metadataLabels(
  provenance: RecipeMetadataProvenance,
  origin: "derived" | "estimated",
) {
  return [
    provenance.servings === origin ? "servings" : null,
    provenance.prepMinutes === origin ? "prep time" : null,
    provenance.cookMinutes === origin ? "cook time" : null,
  ].filter((label): label is string => label !== null);
}

function formatList(values: string[]) {
  if (values.length < 2) return values[0] ?? "";
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}

function sentenceCase(value: string) {
  return value ? value[0].toUpperCase() + value.slice(1) : value;
}
