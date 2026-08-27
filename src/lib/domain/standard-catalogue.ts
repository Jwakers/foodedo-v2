import { prepareStandardCatalogue, type CatalogueMeal } from "./recipes";

export const standardCatalogue = prepareStandardCatalogue({
  version: 1,
  meals: [
    {
      id: "tomato-lentil-pasta",
      slug: "tomato-and-lentil-pasta",
      title: "Tomato and lentil pasta",
      description:
        "A dependable tomato pasta with red lentils cooked into the sauce.",
      servings: 4,
      prepMinutes: 10,
      cookMinutes: 30,
      ingredients: [
        {
          id: "pasta",
          name: "dried pasta",
          quantity: "320",
          unit: "g",
        },
        {
          id: "lentils",
          name: "red lentils",
          quantity: "150",
          unit: "g",
        },
        {
          id: "tomatoes",
          name: "chopped tomatoes",
          quantity: "2 × 400g",
          unit: "tins",
        },
        {
          id: "onion",
          name: "onion",
          quantity: "1",
          note: "finely chopped",
        },
        {
          id: "garlic",
          name: "garlic",
          quantity: "2",
          unit: "cloves",
          note: "finely chopped",
        },
        {
          id: "oil",
          name: "olive oil",
          quantity: "1",
          unit: "tbsp",
        },
      ],
      steps: [
        {
          id: "soften",
          text: "Warm the oil in a saucepan and soften the onion for 6–8 minutes. Add the garlic and cook for another minute.",
        },
        {
          id: "simmer",
          text: "Add the tomatoes, lentils and one tinful of water. Simmer for 20–25 minutes, stirring occasionally, until the lentils are tender.",
        },
        {
          id: "pasta",
          text: "Cook the pasta according to its packet, then drain and fold it through the sauce.",
        },
      ],
    },
    {
      id: "ginger-chicken-rice",
      slug: "ginger-chicken-rice-bowls",
      title: "Ginger chicken rice bowls",
      description:
        "Sticky ginger chicken with crisp vegetables and steamed rice.",
      servings: 4,
      prepMinutes: 15,
      cookMinutes: 20,
      ingredients: [
        {
          id: "chicken",
          name: "boneless chicken thighs",
          quantity: "600",
          unit: "g",
          note: "cut into bite-sized pieces",
        },
        {
          id: "rice",
          name: "long-grain rice",
          quantity: "300",
          unit: "g",
        },
        {
          id: "ginger",
          name: "fresh ginger",
          quantity: "thumb-sized piece",
          note: "finely grated",
        },
        {
          id: "soy",
          name: "soy sauce",
          quantity: "3",
          unit: "tbsp",
        },
        {
          id: "honey",
          name: "honey",
          quantity: "1",
          unit: "tbsp",
        },
        {
          id: "vegetables",
          name: "crisp vegetables",
          quantity: "400",
          unit: "g",
          note: "such as peppers, carrots or sugar snap peas",
        },
      ],
      steps: [
        {
          id: "rice",
          text: "Cook the rice according to its packet and keep it covered while you prepare the chicken.",
        },
        {
          id: "chicken",
          text: "Brown the chicken in a wide pan over a medium-high heat until cooked through.",
        },
        {
          id: "glaze",
          text: "Add the ginger, soy sauce and honey. Cook for 2–3 minutes until the chicken is glossy, then serve with the rice and vegetables.",
        },
      ],
    },
    {
      id: "chickpea-coconut-curry",
      slug: "chickpea-coconut-curry",
      title: "Chickpea coconut curry",
      description:
        "A gently spiced cupboard curry finished with spinach and lime.",
      servings: 4,
      prepMinutes: 10,
      cookMinutes: 25,
      ingredients: [
        {
          id: "chickpeas",
          name: "chickpeas",
          quantity: "2 × 400g",
          unit: "tins",
          note: "drained",
        },
        {
          id: "coconut-milk",
          name: "coconut milk",
          quantity: "1 × 400ml",
          unit: "tin",
        },
        {
          id: "tomatoes",
          name: "chopped tomatoes",
          quantity: "1 × 400g",
          unit: "tin",
        },
        {
          id: "curry-powder",
          name: "medium curry powder",
          quantity: "2",
          unit: "tbsp",
        },
        {
          id: "spinach",
          name: "spinach",
          quantity: "150",
          unit: "g",
        },
        {
          id: "lime",
          name: "lime",
          quantity: "1",
        },
      ],
      steps: [
        {
          id: "toast",
          text: "Warm a little oil in a saucepan and cook the curry powder for 30 seconds until fragrant.",
        },
        {
          id: "simmer",
          text: "Stir in the chickpeas, tomatoes and coconut milk. Simmer uncovered for 18–20 minutes.",
        },
        {
          id: "finish",
          text: "Fold in the spinach until wilted, then season and finish with lime juice.",
        },
      ],
    },
  ],
});

export function findStandardCatalogueMeal(
  catalogueMealId: string,
  catalogueVersion: number,
): CatalogueMeal | null {
  if (catalogueVersion !== standardCatalogue.version) return null;

  return (
    standardCatalogue.meals.find((meal) => meal.id === catalogueMealId) ?? null
  );
}

export function findStandardCatalogueMealBySlug(
  slug: string,
): CatalogueMeal | null {
  return standardCatalogue.meals.find((meal) => meal.slug === slug) ?? null;
}
