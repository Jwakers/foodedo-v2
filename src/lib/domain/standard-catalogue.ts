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
    temporaryCatalogueMeal({
      id: "lemon-chicken-traybake",
      slug: "lemon-herb-chicken-traybake",
      title: "Lemon herb chicken traybake",
      description: "Roast chicken, potatoes and greens in one dependable tray.",
      servings: 4,
      prepMinutes: 10,
      cookMinutes: 40,
      ingredients: [
        { name: "chicken thighs", quantity: "600", unit: "g" },
        { name: "potatoes", quantity: "800", unit: "g" },
        { name: "lemon", quantity: "1" },
        { name: "green beans", quantity: "300", unit: "g" },
      ],
      steps: [
        "Toss the chicken and potatoes with oil, lemon and dried herbs.",
        "Roast until golden, adding the green beans for the final 12 minutes.",
      ],
    }),
    temporaryCatalogueMeal({
      id: "beef-broccoli-noodles",
      slug: "beef-and-broccoli-noodles",
      title: "Beef and broccoli noodles",
      description: "Quick savoury noodles with strips of beef and broccoli.",
      servings: 4,
      prepMinutes: 15,
      cookMinutes: 15,
      ingredients: [
        { name: "beef strips", quantity: "500", unit: "g" },
        { name: "egg noodles", quantity: "300", unit: "g" },
        { name: "broccoli", quantity: "2", unit: "heads" },
        { name: "soy sauce", quantity: "3", unit: "tbsp" },
      ],
      steps: [
        "Cook the noodles and blanch the broccoli until just tender.",
        "Sear the beef, add the soy sauce, then toss through the noodles and broccoli.",
      ],
    }),
    temporaryCatalogueMeal({
      id: "mushroom-risotto",
      slug: "creamy-mushroom-risotto",
      title: "Creamy mushroom risotto",
      description: "A simple mushroom risotto finished with parmesan.",
      servings: 4,
      prepMinutes: 10,
      cookMinutes: 35,
      ingredients: [
        { name: "risotto rice", quantity: "320", unit: "g" },
        { name: "mushrooms", quantity: "400", unit: "g" },
        { name: "vegetable stock", quantity: "1", unit: "litre" },
        { name: "parmesan", quantity: "60", unit: "g" },
      ],
      steps: [
        "Brown the mushrooms, then stir in the rice.",
        "Add the stock gradually until the rice is tender, then finish with parmesan.",
      ],
    }),
    temporaryCatalogueMeal({
      id: "black-bean-tacos",
      slug: "black-bean-and-avocado-tacos",
      title: "Black bean and avocado tacos",
      description: "Fast tacos with seasoned beans, avocado and salsa.",
      servings: 4,
      prepMinutes: 15,
      cookMinutes: 10,
      ingredients: [
        { name: "small tortillas", quantity: "8" },
        { name: "black beans", quantity: "2 × 400g", unit: "tins" },
        { name: "avocados", quantity: "2" },
        { name: "tomato salsa", quantity: "200", unit: "g" },
      ],
      steps: [
        "Warm the beans with cumin and a splash of water.",
        "Fill the warmed tortillas with beans, avocado and salsa.",
      ],
    }),
    temporaryCatalogueMeal({
      id: "salmon-pesto-potatoes",
      slug: "pesto-salmon-with-crushed-potatoes",
      title: "Pesto salmon with crushed potatoes",
      description: "Roasted salmon with pesto, potatoes and peas.",
      servings: 4,
      prepMinutes: 10,
      cookMinutes: 30,
      ingredients: [
        { name: "salmon fillets", quantity: "4" },
        { name: "baby potatoes", quantity: "750", unit: "g" },
        { name: "basil pesto", quantity: "4", unit: "tbsp" },
        { name: "frozen peas", quantity: "300", unit: "g" },
      ],
      steps: [
        "Boil and lightly crush the potatoes, then spread them on a roasting tray.",
        "Add the salmon and pesto, roast until cooked, and serve with peas.",
      ],
    }),
    temporaryCatalogueMeal({
      id: "sausage-tomato-gnocchi",
      slug: "sausage-and-tomato-gnocchi",
      title: "Sausage and tomato gnocchi",
      description: "Soft gnocchi in a rich sausage and tomato sauce.",
      servings: 4,
      prepMinutes: 10,
      cookMinutes: 25,
      ingredients: [
        { name: "pork sausages", quantity: "8" },
        { name: "potato gnocchi", quantity: "500", unit: "g" },
        { name: "chopped tomatoes", quantity: "1 × 400g", unit: "tin" },
        { name: "spinach", quantity: "150", unit: "g" },
      ],
      steps: [
        "Brown the sausage meat, then add the tomatoes and simmer.",
        "Cook the gnocchi in the sauce and fold through the spinach.",
      ],
    }),
    temporaryCatalogueMeal({
      id: "halloumi-couscous-bowls",
      slug: "halloumi-and-roasted-pepper-couscous",
      title: "Halloumi and roasted pepper couscous",
      description: "Golden halloumi over lemony couscous and vegetables.",
      servings: 4,
      prepMinutes: 15,
      cookMinutes: 20,
      ingredients: [
        { name: "halloumi", quantity: "250", unit: "g" },
        { name: "couscous", quantity: "300", unit: "g" },
        { name: "red peppers", quantity: "2" },
        { name: "cucumber", quantity: "1" },
      ],
      steps: [
        "Roast the peppers and cover the couscous with boiling stock.",
        "Fry the halloumi and serve it over the couscous with cucumber.",
      ],
    }),
    temporaryCatalogueMeal({
      id: "turkey-chilli",
      slug: "smoky-turkey-chilli",
      title: "Smoky turkey chilli",
      description: "A lighter chilli with turkey, beans and rice.",
      servings: 4,
      prepMinutes: 10,
      cookMinutes: 30,
      ingredients: [
        { name: "turkey mince", quantity: "500", unit: "g" },
        { name: "kidney beans", quantity: "1 × 400g", unit: "tin" },
        { name: "chopped tomatoes", quantity: "2 × 400g", unit: "tins" },
        { name: "long-grain rice", quantity: "300", unit: "g" },
      ],
      steps: [
        "Brown the turkey with smoked paprika and cumin.",
        "Add the beans and tomatoes, simmer, and serve with rice.",
      ],
    }),
    temporaryCatalogueMeal({
      id: "spinach-ricotta-pasta-bake",
      slug: "spinach-and-ricotta-pasta-bake",
      title: "Spinach and ricotta pasta bake",
      description: "Baked pasta layered with spinach, ricotta and tomato.",
      servings: 4,
      prepMinutes: 15,
      cookMinutes: 35,
      ingredients: [
        { name: "dried pasta", quantity: "350", unit: "g" },
        { name: "ricotta", quantity: "250", unit: "g" },
        { name: "spinach", quantity: "200", unit: "g" },
        { name: "passata", quantity: "500", unit: "g" },
      ],
      steps: [
        "Cook the pasta briefly and mix the ricotta with wilted spinach.",
        "Layer with passata and bake until bubbling and golden.",
      ],
    }),
    temporaryCatalogueMeal({
      id: "thai-green-vegetable-curry",
      slug: "thai-green-vegetable-curry",
      title: "Thai green vegetable curry",
      description: "A fragrant coconut curry packed with mixed vegetables.",
      servings: 4,
      prepMinutes: 15,
      cookMinutes: 20,
      ingredients: [
        { name: "Thai green curry paste", quantity: "3", unit: "tbsp" },
        { name: "coconut milk", quantity: "1 × 400ml", unit: "tin" },
        { name: "mixed vegetables", quantity: "600", unit: "g" },
        { name: "jasmine rice", quantity: "300", unit: "g" },
      ],
      steps: [
        "Fry the curry paste, then stir in the coconut milk.",
        "Simmer the vegetables until tender and serve with rice.",
      ],
    }),
    temporaryCatalogueMeal({
      id: "teriyaki-tofu-rice",
      slug: "teriyaki-tofu-rice-bowls",
      title: "Teriyaki tofu rice bowls",
      description: "Crisp tofu with sticky teriyaki sauce and greens.",
      servings: 4,
      prepMinutes: 15,
      cookMinutes: 20,
      ingredients: [
        { name: "firm tofu", quantity: "400", unit: "g" },
        { name: "teriyaki sauce", quantity: "5", unit: "tbsp" },
        { name: "long-grain rice", quantity: "300", unit: "g" },
        { name: "pak choi", quantity: "2" },
      ],
      steps: [
        "Cook the rice and fry the tofu until crisp.",
        "Coat the tofu in teriyaki sauce and serve with steamed pak choi.",
      ],
    }),
    temporaryCatalogueMeal({
      id: "prawn-tomato-linguine",
      slug: "prawn-and-tomato-linguine",
      title: "Prawn and tomato linguine",
      description: "A quick garlicky tomato pasta with prawns.",
      servings: 4,
      prepMinutes: 10,
      cookMinutes: 15,
      ingredients: [
        { name: "linguine", quantity: "320", unit: "g" },
        { name: "raw prawns", quantity: "400", unit: "g" },
        { name: "cherry tomatoes", quantity: "300", unit: "g" },
        { name: "garlic", quantity: "3", unit: "cloves" },
      ],
      steps: [
        "Cook the linguine and soften the garlic and tomatoes in a wide pan.",
        "Add the prawns, then toss with the pasta and a little cooking water.",
      ],
    }),
    temporaryCatalogueMeal({
      id: "chicken-fajita-bowls",
      slug: "chicken-fajita-rice-bowls",
      title: "Chicken fajita rice bowls",
      description: "Spiced chicken and peppers piled over rice.",
      servings: 4,
      prepMinutes: 15,
      cookMinutes: 20,
      ingredients: [
        { name: "chicken breast", quantity: "600", unit: "g" },
        { name: "mixed peppers", quantity: "3" },
        { name: "long-grain rice", quantity: "300", unit: "g" },
        { name: "fajita seasoning", quantity: "2", unit: "tbsp" },
      ],
      steps: [
        "Cook the rice and toss the chicken and peppers with the seasoning.",
        "Fry until browned and tender, then serve over the rice.",
      ],
    }),
    temporaryCatalogueMeal({
      id: "sweet-potato-lentil-dhal",
      slug: "sweet-potato-and-lentil-dhal",
      title: "Sweet potato and lentil dhal",
      description: "A gently spiced dhal with sweet potato and spinach.",
      servings: 4,
      prepMinutes: 10,
      cookMinutes: 30,
      ingredients: [
        { name: "sweet potatoes", quantity: "600", unit: "g" },
        { name: "red lentils", quantity: "250", unit: "g" },
        { name: "coconut milk", quantity: "1 × 400ml", unit: "tin" },
        { name: "spinach", quantity: "150", unit: "g" },
      ],
      steps: [
        "Simmer the sweet potato and lentils with spices and coconut milk.",
        "When tender, fold through the spinach and season to taste.",
      ],
    }),
    temporaryCatalogueMeal({
      id: "pork-apple-meatballs",
      slug: "pork-and-apple-meatballs",
      title: "Pork and apple meatballs",
      description: "Savoury pork meatballs with apple and creamy mash.",
      servings: 4,
      prepMinutes: 20,
      cookMinutes: 25,
      ingredients: [
        { name: "pork mince", quantity: "500", unit: "g" },
        { name: "apple", quantity: "1" },
        { name: "breadcrumbs", quantity: "60", unit: "g" },
        { name: "potatoes", quantity: "700", unit: "g" },
      ],
      steps: [
        "Mix the pork with grated apple and breadcrumbs, then shape into meatballs.",
        "Brown and cook through while boiling the potatoes for mash.",
      ],
    }),
    temporaryCatalogueMeal({
      id: "tuna-sweetcorn-jackets",
      slug: "tuna-and-sweetcorn-jacket-potatoes",
      title: "Tuna and sweetcorn jacket potatoes",
      description: "Crisp baked potatoes with a familiar tuna filling.",
      servings: 4,
      prepMinutes: 10,
      cookMinutes: 60,
      ingredients: [
        { name: "large baking potatoes", quantity: "4" },
        { name: "tuna", quantity: "2 × 145g", unit: "tins" },
        { name: "sweetcorn", quantity: "1 × 198g", unit: "tin" },
        { name: "cheddar", quantity: "100", unit: "g" },
      ],
      steps: [
        "Bake the potatoes until crisp outside and soft in the centre.",
        "Mix the tuna and sweetcorn, fill the potatoes and top with cheddar.",
      ],
    }),
    temporaryCatalogueMeal({
      id: "aubergine-tomato-bake",
      slug: "aubergine-and-tomato-bake",
      title: "Aubergine and tomato bake",
      description: "Layers of roasted aubergine, tomato and mozzarella.",
      servings: 4,
      prepMinutes: 15,
      cookMinutes: 40,
      ingredients: [
        { name: "aubergines", quantity: "2" },
        { name: "passata", quantity: "500", unit: "g" },
        { name: "mozzarella", quantity: "250", unit: "g" },
        { name: "breadcrumbs", quantity: "50", unit: "g" },
      ],
      steps: [
        "Roast slices of aubergine until tender.",
        "Layer with passata and mozzarella, top with breadcrumbs and bake.",
      ],
    }),
    temporaryCatalogueMeal({
      id: "beef-cottage-pie",
      slug: "classic-beef-cottage-pie",
      title: "Classic beef cottage pie",
      description: "Rich minced beef and vegetables under golden mash.",
      servings: 4,
      prepMinutes: 20,
      cookMinutes: 45,
      ingredients: [
        { name: "beef mince", quantity: "500", unit: "g" },
        { name: "potatoes", quantity: "900", unit: "g" },
        { name: "carrots", quantity: "3" },
        { name: "frozen peas", quantity: "200", unit: "g" },
      ],
      steps: [
        "Cook the beef and carrots in a savoury gravy while boiling the potatoes.",
        "Top with mash and bake until the edges are bubbling and golden.",
      ],
    }),
    temporaryCatalogueMeal({
      id: "miso-salmon-noodles",
      slug: "miso-salmon-noodles",
      title: "Miso salmon noodles",
      description: "Miso-glazed salmon with noodles and greens.",
      servings: 4,
      prepMinutes: 15,
      cookMinutes: 20,
      ingredients: [
        { name: "salmon fillets", quantity: "4" },
        { name: "egg noodles", quantity: "300", unit: "g" },
        { name: "white miso paste", quantity: "3", unit: "tbsp" },
        { name: "seasonal greens", quantity: "300", unit: "g" },
      ],
      steps: [
        "Brush the salmon with miso and roast until just cooked.",
        "Cook the noodles and greens, then serve beneath the salmon.",
      ],
    }),
    temporaryCatalogueMeal({
      id: "greek-chicken-orzo",
      slug: "greek-chicken-and-tomato-orzo",
      title: "Greek chicken and tomato orzo",
      description: "A one-pan chicken and orzo dinner finished with feta.",
      servings: 4,
      prepMinutes: 15,
      cookMinutes: 30,
      ingredients: [
        { name: "chicken thighs", quantity: "600", unit: "g" },
        { name: "orzo", quantity: "300", unit: "g" },
        { name: "cherry tomatoes", quantity: "250", unit: "g" },
        { name: "feta", quantity: "150", unit: "g" },
      ],
      steps: [
        "Brown the chicken, then add the orzo, tomatoes and stock.",
        "Simmer until tender and finish with crumbled feta.",
      ],
    }),
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

function temporaryCatalogueMeal({
  ingredients,
  steps,
  ...meal
}: Omit<CatalogueMeal, "ingredients" | "steps"> & {
  ingredients: Array<Omit<CatalogueMeal["ingredients"][number], "id">>;
  steps: string[];
}): CatalogueMeal {
  return {
    ...meal,
    ingredients: ingredients.map((ingredient, index) => ({
      id: `ingredient-${index + 1}`,
      ...ingredient,
    })),
    steps: steps.map((text, index) => ({
      id: `step-${index + 1}`,
      text,
    })),
  };
}
