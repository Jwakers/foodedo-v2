import type { RecipeIngredientLine } from "@/lib/domain/recipes";

/** Left column of an ingredient row: quantity + unit, or an em dash. */
export function formatIngredientAmount(line: RecipeIngredientLine): string {
  const amount = [line.quantity, line.unit]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part && part.length > 0))
    .join(" ");

  return amount.length > 0 ? amount : "—";
}

/** Right column of an ingredient row: name with optional note. */
export function formatIngredientName(line: RecipeIngredientLine): string {
  const note = line.note?.trim();
  if (!note) return line.name;
  return `${line.name}, ${note}`;
}
