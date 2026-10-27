import Link from "next/link";
import { recipeServingModel } from "@/lib/domain/ingredient-scaling";
import { SHOPPING_CATEGORIES, type RecipeContent } from "@/lib/domain/recipes";
import {
  classifyShoppingIngredient,
  deriveShoppingListItems,
} from "@/lib/domain/shopping-list";
import snapshot from "./shopping-list-example.json";

const verifiedDate = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
}).format(new Date(`${snapshot.verifiedOn}T00:00:00Z`));

type ExampleRecipe = Pick<
  RecipeContent,
  "servings" | "minimumServings" | "servingScaling" | "ingredients"
> & {
  id: string;
  slug: string;
  title: string;
  version: number;
};

export const exampleRecipes: readonly ExampleRecipe[] =
  snapshot.recipes as ExampleRecipe[];
export const exampleItems = deriveShoppingListItems(
  exampleRecipes.map((recipe) => ({
    recipeId: recipe.id,
    title: recipe.title,
    requestedServings: snapshot.requestedServings,
    ingredients: recipeServingModel(
      recipe,
      snapshot.requestedServings,
    ).ingredients.map((ingredient) => ({
      ...ingredient,
      // Cupboard staples share one section, even when source categories differ.
      shoppingCategory:
        classifyShoppingIngredient(ingredient.name) === "staple"
          ? ("pantry" as const)
          : ingredient.shoppingCategory,
    })),
  })),
).map((item) => ({
  ...item,
  // Reviewed labels for this fixed example; retain the original source details.
  displayName: item.displayName
    .replace(/^(\d+) garlic$/, "$1 garlic cloves")
    .replace(/^(\d+) fillets salmon fillets$/, "$1 salmon fillets")
    .replace(/^(\d+) tomato$/, "$1 tomatoes"),
}));

const labels = {
  fruit_and_veg: "Fruit & veg",
  meat_and_fish: "Meat & fish",
  dairy_and_eggs: "Dairy & eggs",
  pantry: "Pantry",
  bakery: "Bakery",
  other: "Other",
};
const headingClass =
  "font-display text-26 leading-snug font-semibold tracking-heading";

export function ShoppingListExample() {
  return (
    <>
      <section
        aria-labelledby="example-dinners"
        className="flex flex-col gap-4 border-t border-border pt-6"
      >
        <h2 id="example-dinners" className={headingClass}>
          Three dinners for two people
        </h2>
        <p className="text-16 leading-7 text-graphite">
          Here is a worked grocery list for three Foodedo recipes. Each recipe
          makes two servings at its authored quantities, so this example needs
          no scaling.
        </p>
        <ul className="space-y-3">
          {exampleRecipes.map((recipe) => (
            <li key={recipe.id}>
              <Link
                href={`/recipes/${recipe.slug}`}
                className="inline-flex min-h-11 items-center text-16 underline underline-offset-4 focus-visible:outline-cadmium"
              >
                {recipe.title}
              </Link>
              <p className="text-12 text-graphite">
                2 servings · recipe revision {recipe.version}
              </p>
            </li>
          ))}
        </ul>
        <p className="text-14 leading-6 text-graphite">
          Checked <time dateTime={snapshot.verifiedOn}>{verifiedDate}</time>.
          This is a reviewed example of those recipe revisions; check the linked
          recipes before shopping if they have since changed.
        </p>
      </section>
      <section
        aria-labelledby="example-shopping"
        className="flex flex-col gap-5 border-t border-border pt-6"
      >
        <h2 id="example-shopping" className={headingClass}>
          One combined shopping list
        </h2>
        <p className="text-16 leading-7 text-graphite">
          These are the recipe quantities you need, not rounded supermarket pack
          sizes. The headings use Foodedo’s shopping sections, rather than a
          supermarket-specific aisle map. Check your cupboards before buying
          anything.
        </p>
        {SHOPPING_CATEGORIES.map((category) => {
          const items = exampleItems.filter(
            (item) =>
              item.category === category && item.treatment === "required",
          );
          if (!items.length) return null;
          return (
            <section key={category} aria-labelledby={`example-${category}`}>
              <h3
                id={`example-${category}`}
                className="mb-3 text-18 font-semibold"
              >
                {labels[category]}
              </h3>
              <ul className="space-y-4">
                {items.map((item) => (
                  <li key={item.name} className="border-l-2 border-border pl-4">
                    <p className="text-16 font-semibold">{item.displayName}</p>
                    <ul className="mt-1 space-y-1 text-14 leading-6 text-graphite">
                      {item.detailLines.map((line, index) => (
                        <li key={index}>{line}</li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
        <section
          aria-labelledby="example-staples"
          className="rounded-surface bg-mist p-5"
        >
          <h3 id="example-staples" className="mb-3 text-18 font-semibold">
            Check your cupboards
          </h3>
          <p className="mb-4 text-14 leading-6 text-graphite">
            Foodedo suggests these staples separately. Add the ones you need; it
            does not know what is already at home. Water is not included in the
            shopping list.
          </p>
          <ul className="space-y-4">
            {exampleItems
              .filter((item) => item.treatment === "staple")
              .map((item) => (
                <li key={`${item.category}-${item.name}`}>
                  <p className="text-16 font-semibold">{item.displayName}</p>
                  <ul className="mt-1 text-14 leading-6 text-graphite">
                    {item.detailLines.map((line, index) => (
                      <li key={index}>{line}</li>
                    ))}
                  </ul>
                </li>
              ))}
          </ul>
        </section>
      </section>
      <section
        aria-labelledby="example-merging"
        className="flex flex-col gap-4 border-t border-border pt-6"
      >
        <h2 id="example-merging" className={headingClass}>
          What merges, and what needs a check?
        </h2>
        <ul className="list-disc space-y-2 pl-5 text-16 leading-7 text-graphite">
          <li>Broccoli: 250 g + 300 g = 550 g.</li>
          <li>Fresh ginger: 15 g + 15 g = 30 g.</li>
          <li>Cornflour: 4 tsp + 1 tsp = 5 tsp.</li>
          <li>
            Long-grain white rice and jasmine rice keep their different names
            and stay separate.
          </li>
          <li>
            Rice vinegar is grouped, but 1 tbsp and 15 ml remain as source
            amounts. Foodedo does not turn them into a combined total.
          </li>
          <li>
            Toasted sesame oil is grouped, but its 2 tsp and 5 ml stay as source
            amounts; black sesame seeds and sesame seeds, like soy sauce and
            light soy sauce, keep their different names so you can check the
            recipes before deciding whether one product will suit both.
          </li>
        </ul>
        <p className="text-16 leading-7 text-graphite">
          Matching names and shopping categories can be grouped. Only
          compatible, readable quantities are added. Different names, categories
          or units, including amounts such as “to taste”, may need your
          judgement. The source lines above show what each meal needs.
        </p>
      </section>
    </>
  );
}
