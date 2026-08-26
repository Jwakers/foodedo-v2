import type { CatalogueMeal } from "@/lib/domain/recipes";
import { standardCatalogue } from "@/lib/domain/standard-catalogue";
import { SaveCatalogueMealButton } from "./save-catalogue-meal-button";

export function StandardCatalogue() {
  return (
    <section aria-labelledby="catalogue-heading" className="mt-16">
      <div className="max-w-2xl">
        <p className="text-xs font-bold tracking-[0.18em] text-[var(--accent)] uppercase">
          Standard catalogue · version {standardCatalogue.version}
        </p>
        <h2
          id="catalogue-heading"
          className="mt-3 font-serif text-4xl leading-tight tracking-[-0.025em] text-[var(--ink)] sm:text-5xl"
        >
          A few good answers to “what shall we eat?”
        </h2>
        <p className="mt-5 max-w-xl text-base leading-7 text-[var(--muted)]">
          These recipes are available to everyone. Browse freely; sign in only
          when you want to keep one in your personal collection.
        </p>
      </div>

      <div className="mt-12 border-t border-[var(--line)]">
        {standardCatalogue.meals.map((meal, index) => (
          <CatalogueMealView key={meal.id} meal={meal} number={index + 1} />
        ))}
      </div>
    </section>
  );
}

function CatalogueMealView({
  meal,
  number,
}: {
  meal: CatalogueMeal;
  number: number;
}) {
  const totalMinutes = (meal.prepMinutes ?? 0) + (meal.cookMinutes ?? 0);

  return (
    <article className="grid gap-6 border-b border-[var(--line)] py-10 sm:grid-cols-[4rem_1fr] sm:gap-8">
      <p
        className="font-serif text-4xl leading-none text-[var(--line-strong)]"
        aria-hidden="true"
      >
        {String(number).padStart(2, "0")}
      </p>

      <div>
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
          <div>
            <h3 className="font-serif text-3xl leading-tight tracking-[-0.02em] text-[var(--ink)]">
              {meal.title}
            </h3>
            {meal.description ? (
              <p className="mt-2 max-w-xl leading-7 text-[var(--muted)]">
                {meal.description}
              </p>
            ) : null}
            <p className="mt-3 text-sm font-medium text-[var(--accent)]">
              {meal.servings
                ? `${meal.servings} servings`
                : "Flexible servings"}
              {totalMinutes > 0 ? ` · ${totalMinutes} minutes` : ""}
            </p>
          </div>

          <SaveCatalogueMealButton
            catalogueMealId={meal.id}
            catalogueVersion={standardCatalogue.version}
          />
        </div>

        <details className="group mt-7 border-t border-[var(--line)]">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between py-3 text-sm font-semibold text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]">
            View ingredients and method
            <span
              className="text-lg font-normal transition-transform group-open:rotate-45"
              aria-hidden="true"
            >
              +
            </span>
          </summary>

          <div className="grid gap-8 pb-3 pt-5 md:grid-cols-2">
            <div>
              <h4 className="text-xs font-bold tracking-[0.16em] text-[var(--accent)] uppercase">
                Ingredients
              </h4>
              <ul className="mt-4 space-y-3 text-sm leading-6 text-[var(--ink-soft)]">
                {meal.ingredients.map((ingredient) => (
                  <li key={ingredient.id}>{formatIngredient(ingredient)}</li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="text-xs font-bold tracking-[0.16em] text-[var(--accent)] uppercase">
                Method
              </h4>
              <ol className="mt-4 space-y-4 text-sm leading-6 text-[var(--ink-soft)]">
                {meal.steps.map((step, index) => (
                  <li
                    key={step.id}
                    className="grid grid-cols-[1.5rem_1fr] gap-2"
                  >
                    <span className="font-semibold text-[var(--accent)]">
                      {index + 1}.
                    </span>
                    <span>{step.text}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </details>
      </div>
    </article>
  );
}

function formatIngredient(ingredient: CatalogueMeal["ingredients"][number]) {
  const amount = [ingredient.quantity, ingredient.unit]
    .filter(Boolean)
    .join(" ");
  const core = [amount, ingredient.name].filter(Boolean).join(" ");

  return ingredient.note ? `${core}, ${ingredient.note}` : core;
}
