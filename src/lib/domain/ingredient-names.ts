type IngredientName = {
  singular: string;
  plural?: string;
  aliases?: readonly string[];
};

/**
 * Explicit whole-name equivalences for Shopping, with UK display names.
 * Add spellings here, not stemming/substitution rules. Preserve distinctions
 * such as fresh/dried, colour, size, preparation and packaged form. This is
 * local enrichment: recipe content and unknown names remain valid unchanged.
 */
export const INGREDIENT_NAMES: readonly IngredientName[] = [
  { singular: "egg", plural: "eggs" },
  { singular: "egg white", plural: "egg whites" },
  { singular: "egg yolk", plural: "egg yolks" },
  // Ordinary cooking onions share a shopping default. Keep explicitly
  // different varieties (red, white, spring onions, shallots) separate.
  {
    singular: "onion",
    plural: "onions",
    aliases: ["brown onion", "brown onions", "yellow onion", "yellow onions"],
  },
  { singular: "red onion", plural: "red onions" },
  { singular: "white onion", plural: "white onions" },
  { singular: "shallot", plural: "shallots" },
  {
    singular: "spring onion",
    plural: "spring onions",
    aliases: ["scallion", "scallions", "green onion", "green onions"],
  },
  { singular: "tomato", plural: "tomatoes" },
  { singular: "cherry tomato", plural: "cherry tomatoes" },
  { singular: "potato", plural: "potatoes" },
  { singular: "sweet potato", plural: "sweet potatoes" },
  { singular: "carrot", plural: "carrots" },
  { singular: "parsnip", plural: "parsnips" },
  { singular: "leek", plural: "leeks" },
  { singular: "mushroom", plural: "mushrooms" },
  {
    singular: "courgette",
    plural: "courgettes",
    aliases: ["zucchini", "zucchinis"],
  },
  {
    singular: "aubergine",
    plural: "aubergines",
    aliases: ["eggplant", "eggplants"],
  },
  { singular: "cucumber", plural: "cucumbers" },
  {
    singular: "bell pepper",
    plural: "bell peppers",
    aliases: ["sweet pepper", "sweet peppers"],
  },
  {
    singular: "red bell pepper",
    plural: "red bell peppers",
    aliases: [
      "red pepper",
      "red peppers",
      "red sweet pepper",
      "red sweet peppers",
    ],
  },
  {
    singular: "green bell pepper",
    plural: "green bell peppers",
    aliases: [
      "green pepper",
      "green peppers",
      "green sweet pepper",
      "green sweet peppers",
    ],
  },
  {
    singular: "yellow bell pepper",
    plural: "yellow bell peppers",
    aliases: [
      "yellow pepper",
      "yellow peppers",
      "yellow sweet pepper",
      "yellow sweet peppers",
    ],
  },
  {
    singular: "chilli",
    plural: "chillies",
    aliases: ["chili", "chilis", "chilies"],
  },
  { singular: "lemon", plural: "lemons" },
  { singular: "lime", plural: "limes" },
  { singular: "orange", plural: "oranges" },
  { singular: "apple", plural: "apples" },
  { singular: "avocado", plural: "avocados" },
  {
    singular: "chickpea",
    plural: "chickpeas",
    aliases: ["garbanzo bean", "garbanzo beans"],
  },
  { singular: "rocket", aliases: ["arugula"] },
  {
    singular: "fresh coriander",
    aliases: ["cilantro", "fresh cilantro", "coriander leaves"],
  },
  {
    singular: "bicarbonate of soda",
    aliases: ["baking soda", "sodium bicarbonate"],
  },
];

function cleanIngredientName(name: string) {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

const namesByAlias = new Map<string, IngredientName>();
for (const ingredient of INGREDIENT_NAMES) {
  const names = new Set([
    ingredient.singular,
    ...(ingredient.plural ? [ingredient.plural] : []),
    ...(ingredient.aliases ?? []),
  ]);
  for (const name of names) {
    const key = cleanIngredientName(name);
    if (namesByAlias.has(key)) {
      throw new Error(`Duplicate ingredient alias: ${key}`);
    }
    namesByAlias.set(key, ingredient);
  }
}

export function normaliseIngredientName(name: string) {
  const key = cleanIngredientName(name);
  return namesByAlias.get(key)?.singular ?? key;
}

export function shoppingIngredientDisplayName(name: string, quantity?: number) {
  const ingredient = namesByAlias.get(cleanIngredientName(name));
  if (!ingredient) return name;
  return quantity === 1
    ? ingredient.singular
    : (ingredient.plural ?? ingredient.singular);
}
