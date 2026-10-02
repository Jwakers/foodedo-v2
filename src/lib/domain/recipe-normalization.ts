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

/** Lossless, conservative first pass. Ambiguous lines remain source-shaped. */
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
  const rawName = cleanImportedText(
    comma >= 0 ? remainder.slice(0, comma) : remainder,
  );
  const name = rawName.replace(/\s*\(\s*Note\s+\d+\s*\)\s*$/i, "");
  const rawNote = comma >= 0 ? remainder.slice(comma + 1) : "";
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

export function selectFullInstructionSection(value: unknown): string[] {
  if (typeof value === "string") return splitInstructions(value);
  if (!Array.isArray(value)) return [];
  const sections = value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const object = item as Record<string, unknown>;
    if (!Array.isArray(object.itemListElement)) return [];
    return [
      {
        name:
          typeof object.name === "string" ? cleanImportedText(object.name) : "",
        steps: selectFullInstructionSection(object.itemListElement),
      },
    ];
  });
  if (sections.length > 0) {
    const preferred = sections.find((section) =>
      /\b(full recipe|full method|method|instructions)\b/i.test(section.name),
    );
    if (preferred) return preferred.steps;
    const candidates = sections.filter(
      (section) => !/\b(abbreviated|summary|quick)\b/i.test(section.name),
    );
    return (
      (candidates.length > 0 ? candidates : sections).sort(
        (left, right) => right.steps.length - left.steps.length,
      )[0]?.steps ?? []
    );
  }
  return value.flatMap((item) => {
    if (typeof item === "string") return splitInstructions(item);
    if (!item || typeof item !== "object") return [];
    const object = item as Record<string, unknown>;
    const text =
      typeof object.text === "string"
        ? object.text
        : typeof object.name === "string"
          ? object.name
          : undefined;
    return text ? [cleanImportedText(text)] : [];
  });
}

export type ExtractedInstructionMethod = {
  label?: string;
  steps: Array<{ text: string; group?: string }>;
};

/**
 * Select one complete cooking method. Sequential component headings remain
 * groups within that method; when a publisher supplies genuine alternatives,
 * the first complete authored method is the deliberately simple default.
 */
export function extractPrimaryInstructionMethod(
  value: unknown,
): ExtractedInstructionMethod | undefined {
  if (!Array.isArray(value)) {
    const steps = instructionTexts(value).map((text) => ({ text }));
    return steps.length > 0 ? { steps } : undefined;
  }
  const sections = value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const object = item as Record<string, unknown>;
    if (!Array.isArray(object.itemListElement)) return [];
    const label =
      typeof object.name === "string" ? cleanImportedText(object.name) : "";
    return [
      {
        label,
        steps: instructionTexts(object.itemListElement),
      },
    ];
  });
  if (sections.length === 0) {
    const steps = instructionTexts(value).map((text) => ({ text }));
    return steps.length > 0 ? { steps } : undefined;
  }

  const preferred = sections.find((section) =>
    /\b(full recipe|full method)\b/i.test(section.label),
  );
  if (preferred) {
    return { steps: preferred.steps.map((text) => ({ text })) };
  }
  const useful = sections.filter(
    (section) =>
      !/\b(abbreviated|summary|quick version)\b/i.test(section.label),
  );
  const selected = useful.length > 0 ? useful : sections;
  const hasAlternatives = selected.some((section) =>
    /\b(stove(?:\s*top)?|hob|crockpot|slow cooker|instant pot|pressure cooker|air fryer|oven|barbecue|bbq|grill)\b/i.test(
      section.label,
    ),
  );
  if (hasAlternatives) {
    const primary = selected.find((section) => section.steps.length > 0);
    return primary
      ? {
          ...(primary.label ? { label: primary.label } : {}),
          steps: primary.steps.map((text) => ({ text })),
        }
      : undefined;
  }
  return {
    steps: selected.flatMap((section) =>
      section.steps.map((text) => ({
        text,
        ...(section.label ? { group: section.label } : {}),
      })),
    ),
  };
}

export type NormalisedRecipeNote = {
  id: string;
  label: string;
  text: string;
  sourceText: string;
};

/** Keeps numbered recipe-card notes and conservative continuations only. */
export function normaliseNumberedRecipeNotes(blocks: string[]) {
  if (!blocks.some((text) => /^(?:Note\s*)?\d+[.):\s-]+/i.test(text.trim()))) {
    return [];
  }
  const notes: NormalisedRecipeNote[] = [];
  for (const value of blocks) {
    const sourceText = cleanImportedText(value);
    const numbered = sourceText.match(/^(?:Note\s*)?(\d+)[.):\s-]+(.+)$/i);
    if (numbered) {
      notes.push({
        id: `note-${numbered[1]}`,
        label: `Note ${numbered[1]}`,
        text: cleanImportedText(numbered[2]),
        sourceText,
      });
    } else if (
      notes.length > 0 &&
      !/^(?:to double|leftovers?|nutrition)\b/i.test(sourceText)
    ) {
      const note = notes[notes.length - 1]!;
      note.text = `${note.text} ${sourceText}`;
      note.sourceText = `${note.sourceText} ${sourceText}`;
    }
  }
  return notes;
}

function splitInstructions(value: string) {
  return value
    .split(/(?:\r?\n)+|(?=\d+[.)]\s+)/)
    .map((line) => cleanImportedText(line.replace(/^\s*\d+[.)]\s*/, "")))
    .filter(Boolean);
}

function instructionTexts(value: unknown): string[] {
  if (typeof value === "string") return splitInstructions(value);
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item === "string") return splitInstructions(item);
    if (!item || typeof item !== "object") return [];
    const object = item as Record<string, unknown>;
    if (Array.isArray(object.itemListElement)) {
      return instructionTexts(object.itemListElement);
    }
    const text =
      typeof object.text === "string"
        ? object.text
        : typeof object.name === "string"
          ? object.name
          : undefined;
    return text ? splitInstructions(text) : [];
  });
}

function cleanImportedText(value: string) {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}
