const fraction = String.raw`(?:\d+\s+)?(?:\d+\/\d+|[¼½¾⅓⅔⅛⅜⅝⅞]|\d+(?:\.\d+)?)`;
const unit = String.raw`(?:kg|g|mg|ml|l|oz|lb|tbsp|tsp|tablespoons?|teaspoons?|cups?|cloves?|cans?|tins?|packets?|bunch(?:es)?|handfuls?|slices?)`;

export type NormalisedIngredientText = {
  sourceText: string;
  name: string;
  quantity?: string;
  unit?: string;
  amountText?: string;
  note?: string;
  noteRefs?: string[];
};

/** Legacy source recovery for the owner's Use original editor action; never used by the AI importer. */
export function normaliseImportedIngredientText(
  value: string,
): NormalisedIngredientText {
  const sourceText = cleanImportedText(value)
    .replace(/\(\s*\((.*?)\)\s*\)/g, "($1)")
    .replace(/,\s*\((Note\s*\d+)\)/gi, " ($1)")
    .replace(/\s+,/g, ",")
    .replace(/,\s*,+/g, ",");
  const firstComma = sourceText.indexOf(",");
  const amountAndName =
    firstComma >= 0 ? sourceText.slice(0, firstComma) : sourceText;
  const compound = amountAndName.match(
    new RegExp(`^(.+?${unit}\\b)\\s+([A-Za-z].*)$`, "i"),
  );
  if (compound && /\/|\bor\b/i.test(compound[1])) {
    return finishIngredient(sourceText, compound[2], compound[1]);
  }
  const match = sourceText.match(
    new RegExp(
      `^(${fraction}(?:\\s*[–-]\\s*${fraction})?(?:\\s*[x×])?)?(?:\\s*(${unit})\\b)?\\s+(.+)$`,
      "i",
    ),
  );
  const quantity = cleanImportedText(match?.[1] ?? "");
  const parsedUnit = cleanImportedText(match?.[2] ?? "");
  return finishIngredient(
    sourceText,
    match?.[3] ?? sourceText,
    [quantity, parsedUnit].filter(Boolean).join(" "),
    quantity || undefined,
    parsedUnit || undefined,
  );
}

function finishIngredient(
  sourceText: string,
  remainder: string,
  amount: string,
  quantity?: string,
  parsedUnit?: string,
): NormalisedIngredientText {
  const comma = remainder.indexOf(",");
  // “2 tbsp EACH: paprika, cumin, chilli powder” is one structured source
  // line with a shared amount, not an ingredient followed by a preparation
  // note. This editor recovery action retains the authored line; new imports
  // expand it through the AI measurement contract instead.
  const hasSharedAmountList = /\bEACH\s*:/i.test(remainder);
  const rawName = cleanImportedText(
    comma >= 0 && !hasSharedAmountList ? remainder.slice(0, comma) : remainder,
  );
  const name = rawName.replace(/\s*\(\s*Note\s+\d+\s*\)\s*$/i, "");
  const rawNote =
    comma >= 0 && !hasSharedAmountList ? remainder.slice(comma + 1) : "";
  const note = cleanImportedText(rawNote)
    .replace(/^,\s*/, "")
    .replace(/\s*\(\s*Note\s*\d+\s*\)\s*$/i, "")
    .trim();
  const noteRefs = [...sourceText.matchAll(/\bNote\s*(\d+)\b/gi)].map(
    (reference) => `note-${reference[1]}`,
  );
  return {
    sourceText,
    name: name || sourceText,
    ...(quantity ? { quantity } : {}),
    ...(parsedUnit ? { unit: parsedUnit } : {}),
    ...(amount ? { amountText: normaliseImportedAmountText(amount) } : {}),
    ...(note ? { note } : {}),
    ...(noteRefs.length > 0 ? { noteRefs } : {}),
  };
}

export function normaliseImportedAmountText(value: string) {
  // NFC preserves authored vulgar fractions; NFKC expands `1½` to `11⁄2`.
  return value
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/1\s+1\/2/g, "1½")
    .replace(/1\s+1\/4/g, "1¼")
    .replace(/1\s+3\/4/g, "1¾")
    .replace(/\s*[-–—]\s*/g, "–")
    .replace(/\s*\/\s*/g, " / ");
}

export type ImportedDisplayAmountInput = {
  amountText?: string | null;
  quantity?: string | null;
  unit?: string | null;
  name?: string | null;
  note?: string | null;
};

/**
 * Keeps the amount column amount-only, including for older imports where a
 * model accidentally returned the complete source ingredient as amountText.
 */
export function normaliseImportedDisplayAmount(
  ingredient: ImportedDisplayAmountInput,
): string | undefined {
  const structuredAmount = [ingredient.quantity, ingredient.unit]
    .map((part) => normaliseImportedAmountText(part ?? ""))
    .filter(Boolean)
    .join(" ");
  let amount =
    normaliseImportedAmountText(ingredient.amountText ?? "") ||
    structuredAmount;
  if (!amount) return undefined;

  amount = cutBeforeIngredientPart(amount, ingredient.name);
  amount = cutBeforeIngredientPart(amount, ingredient.note);
  amount = amount.replace(/[,;:]\s*$/, "").trim();

  // Size words and count nouns describe the ingredient, not its measurement.
  // Remove them only at the end of the isolated amount so genuine units stay.
  const trailingDescriptor =
    /\s+(?:(?:extra\s+)?(?:small|medium|large)(?:\s+to\s+(?:small|medium|large))?|whole|cloves?)$/i;
  while (trailingDescriptor.test(amount)) {
    amount = amount.replace(trailingDescriptor, "").trim();
  }

  if (!amount && structuredAmount) amount = structuredAmount;
  return amount ? normaliseImportedAmountText(amount) : undefined;
}

function cutBeforeIngredientPart(value: string, part?: string | null) {
  const cleanPart = cleanImportedText(part ?? "");
  if (!cleanPart) return value;
  const index = value
    .toLocaleLowerCase()
    .indexOf(cleanPart.toLocaleLowerCase());
  if (index <= 0) return value;
  const precedingCharacter = value[index - 1];
  return precedingCharacter && /[\p{L}\p{N}]/u.test(precedingCharacter)
    ? value
    : value.slice(0, index).trim();
}

function cleanImportedText(value: string) {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}
