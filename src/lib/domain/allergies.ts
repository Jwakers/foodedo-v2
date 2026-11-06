/** Reviewed, deliberately bounded vocabulary. Never infer an allergy from arbitrary search text. */
export const ALLERGIES = [
  {
    id: "milk",
    name: "Milk",
    aliases: "dairy butter cheese cream whey casein yoghurt yogurt ghee",
    terms: [
      "milk",
      "butter",
      "cheese",
      "cream",
      "whey",
      "casein",
      "yoghurt",
      "yogurt",
      "ghee",
      "cheddar",
      "parmesan",
      "mozzarella",
      "feta",
      "paneer",
      "halloumi",
      "creme fraiche",
      "buttermilk",
    ],
    possible: ["pesto", "white chocolate", "chocolate"],
  },
  {
    id: "eggs",
    name: "Eggs",
    aliases: "egg albumen mayonnaise",
    terms: ["egg", "eggs", "albumen", "mayonnaise", "mayo"],
    possible: ["pasta", "noodles", "brioche"],
  },
  {
    id: "peanuts",
    name: "Peanuts",
    aliases: "nuts groundnuts arachis",
    terms: ["peanut", "peanuts", "groundnut", "groundnuts", "arachis"],
    possible: ["satay", "mixed nuts", "nut butter", "nuts"],
  },
  {
    id: "tree-nuts",
    name: "Tree nuts",
    aliases:
      "nuts almonds cashews hazelnuts walnuts pecans pistachios brazil macadamia",
    terms: [
      "almond",
      "almonds",
      "cashew",
      "cashews",
      "hazelnut",
      "hazelnuts",
      "walnut",
      "walnuts",
      "pecan",
      "pecans",
      "pistachio",
      "pistachios",
      "brazil nut",
      "brazil nuts",
      "macadamia",
      "macadamias",
      "marzipan",
    ],
    possible: ["pesto", "praline", "mixed nuts", "nut butter", "nuts"],
  },
  {
    id: "wheat",
    name: "Wheat",
    aliases: "flour bread couscous semolina spelt durum",
    terms: [
      "wheat",
      "bulgur",
      "couscous",
      "semolina",
      "spelt",
      "durum",
      "seitan",
    ],
    possible: [
      "flour",
      "bread",
      "breadcrumbs",
      "pasta",
      "noodles",
      "soy sauce",
      "tortilla",
      "wrap",
      "pitta",
      "pita",
      "pastry",
    ],
  },
  {
    id: "fish",
    name: "Fish",
    aliases: "salmon tuna cod anchovies haddock sardines",
    terms: [
      "fish",
      "salmon",
      "tuna",
      "cod",
      "anchovy",
      "anchovies",
      "haddock",
      "sardine",
      "sardines",
      "mackerel",
      "trout",
      "hake",
      "pollock",
      "sea bass",
      "tilapia",
      "bonito",
    ],
    possible: ["worcestershire", "caesar dressing"],
  },
  {
    id: "crustaceans",
    name: "Crustaceans",
    aliases: "shellfish prawns shrimp crab lobster crayfish",
    terms: [
      "prawn",
      "prawns",
      "shrimp",
      "shrimps",
      "crab",
      "lobster",
      "crayfish",
      "langoustine",
      "scampi",
    ],
    possible: ["seafood", "curry paste"],
  },
  {
    id: "molluscs",
    name: "Molluscs",
    aliases: "shellfish mussels squid oysters clams scallops octopus",
    terms: [
      "mussel",
      "mussels",
      "squid",
      "oyster",
      "oysters",
      "clam",
      "clams",
      "scallop",
      "scallops",
      "octopus",
      "calamari",
      "whelk",
      "snail",
      "snails",
    ],
    possible: ["seafood"],
  },
  {
    id: "soya",
    name: "Soya",
    aliases: "soy tofu tempeh edamame miso",
    terms: ["soya", "soy", "tofu", "tempeh", "edamame", "miso", "tamari"],
    possible: [],
  },
  {
    id: "sesame",
    name: "Sesame",
    aliases: "tahini benne",
    terms: ["sesame", "tahini", "benne"],
    possible: ["hummus", "houmous"],
  },
  {
    id: "celery",
    name: "Celery",
    aliases: "celeriac",
    terms: ["celery", "celeriac"],
    possible: ["stock", "bouillon"],
  },
  {
    id: "mustard",
    name: "Mustard",
    aliases: "dijon",
    terms: ["mustard", "dijon"],
    possible: ["mayonnaise", "mayo", "curry powder"],
  },
  {
    id: "lupin",
    name: "Lupin",
    aliases: "lupine",
    terms: ["lupin", "lupine"],
    possible: [],
  },
  {
    id: "sulphites",
    name: "Sulphites",
    aliases: "sulfites sulphur dioxide sulfur dioxide",
    terms: [
      "sulphite",
      "sulphites",
      "sulfite",
      "sulfites",
      "sulphur dioxide",
      "sulfur dioxide",
    ],
    possible: ["wine", "dried fruit", "raisins", "apricots", "vinegar"],
  },
  {
    id: "garlic",
    name: "Garlic",
    aliases: "garlic powder garlic salt",
    terms: ["garlic"],
    possible: ["pesto", "curry paste", "curry powder", "stock", "bouillon"],
  },
] as const;

const milkTerms = [
  ...ALLERGIES[0].terms,
  ...ALLERGIES[0].possible,
  "cream cheese",
  "milk chocolate",
]
  .sort((a, b) => b.length - a.length)
  .join("|");
const milkAlternative = new RegExp(
  `\\b(?:vegan|dairy free|milk free|plant based|non dairy) (?:(?:double|single|heavy|whipping|sour) )?(?:${milkTerms})\\b`,
  "g",
);
const eggAlternative =
  /\b(?:vegan|egg free|eggless) (?:mayonnaise|mayo|eggs?|pasta|noodles|brioche)\b/g;

export type AllergyId = (typeof ALLERGIES)[number]["id"];
export type AllergyEvidence = {
  allergenIds: string[];
  possibleAllergenIds: string[];
};
export const ALLERGY_REMINDER =
  "Always check ingredients, product labels and cross-contact risks.";
export const ALLERGY_DISCLAIMER = `Foodedo checks the ingredient information available to us, but may miss allergens. ${ALLERGY_REMINDER}`;

function normalise(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
function contains(text: string, term: string) {
  return ` ${text} `.includes(` ${term} `);
}
export function validAllergyIds(ids: readonly string[]): AllergyId[] {
  return ALLERGIES.filter((allergy) => ids.includes(allergy.id)).map(
    (allergy) => allergy.id,
  );
}
export function allergyNames(ids: readonly string[]) {
  return ALLERGIES.filter((allergy) => ids.includes(allergy.id)).map(
    (allergy) => allergy.name,
  );
}
export function searchAllergies(query: string) {
  const words = normalise(query).split(" ").filter(Boolean);
  return ALLERGIES.filter((allergy) =>
    words.every((word) =>
      normalise(`${allergy.name} ${allergy.aliases}`).includes(word),
    ),
  );
}

/** Ingredient text only: recipe titles and method prose are not evidence of absence. */
export function ingredientAllergyEvidence(line: {
  name: string;
  note?: string;
}): AllergyEvidence {
  // Preserve ingredient separators before normalising. An alternative label
  // describes its adjacent food, never every ingredient in the same line.
  const parts = line.name
    .split(/[,;/()+]|\b(?:and|with|plus|or|containing|contains)\b/i)
    .map(normalise);
  const text = parts.join(" ");
  const milkText = parts
    .map((part) =>
      part
        .replace(
          /\b(coconut|oat|almond|soy|soya|rice|cashew|hemp) (milk|cream|butter)\b/g,
          "$1",
        )
        .replace(
          /\b(peanut|almond|cashew|sunflower|cocoa|shea) butter\b/g,
          "$1",
        )
        .replace(/\bbutter (beans?|lettuce)\b/g, "$1")
        .replace(/\bcream of tartar\b/g, "tartar")
        .replace(milkAlternative, "alternative"),
    )
    .join(" ");
  const eggText = parts
    .map((part) => part.replace(eggAlternative, "alternative"))
    .join(" ");
  const definite: string[] = [];
  const possible: string[] = [];
  for (const allergy of ALLERGIES) {
    const ingredientText =
      allergy.id === "milk" ? milkText : allergy.id === "eggs" ? eggText : text;
    if (allergy.terms.some((term) => contains(ingredientText, term)))
      definite.push(allergy.id);
    else if (allergy.possible.some((term) => contains(ingredientText, term)))
      possible.push(allergy.id);
  }
  // Notes may name an optional ingredient or contain a product warning. Treat
  // those as uncertainty instead of silently disregarding them.
  const note = normalise(line.note ?? "");
  for (const allergy of ALLERGIES) {
    if (
      !definite.includes(allergy.id) &&
      !possible.includes(allergy.id) &&
      [...allergy.terms, ...allergy.possible].some((term) =>
        contains(note, term),
      )
    )
      possible.push(allergy.id);
  }
  return { allergenIds: definite, possibleAllergenIds: possible };
}
export function recipeAllergyEvidence(recipe: {
  ingredients: readonly { name: string; note?: string }[];
}): AllergyEvidence {
  const evidence = recipe.ingredients.map(ingredientAllergyEvidence);
  const allergenIds = validAllergyIds(
    evidence.flatMap((line) => line.allergenIds),
  );
  return {
    allergenIds,
    possibleAllergenIds: validAllergyIds(
      evidence.flatMap((line) => line.possibleAllergenIds),
    ).filter((id) => !allergenIds.includes(id)),
  };
}
export function allergyMatches(
  evidence: Partial<AllergyEvidence>,
  selected: readonly string[],
) {
  return {
    known: validAllergyIds(evidence.allergenIds ?? []).filter((id) =>
      selected.includes(id),
    ),
    possible: validAllergyIds(evidence.possibleAllergenIds ?? []).filter((id) =>
      selected.includes(id),
    ),
  };
}
export function isAllergyEligible(
  evidence: Partial<AllergyEvidence>,
  selected: readonly string[],
) {
  if (
    selected.length > 0 &&
    (evidence.allergenIds === undefined ||
      evidence.possibleAllergenIds === undefined)
  )
    return false;
  const hits = allergyMatches(evidence, selected);
  return hits.known.length === 0 && hits.possible.length === 0;
}
