import Link from "next/link";
import type { ReactNode } from "react";
import type { RecipeContent } from "@/lib/domain/recipes";

export function RecipeArticle({
  recipe,
  label,
  action,
}: {
  recipe: RecipeContent;
  label: string;
  action?: ReactNode;
}) {
  const totalMinutes = (recipe.prepMinutes ?? 0) + (recipe.cookMinutes ?? 0);

  return (
    <article>
      <div className="border-b border-border pb-9 sm:pb-12">
        <Link
          href="/recipes"
          className="inline-flex min-h-11 items-center text-sm font-semibold text-muted-foreground underline decoration-border-strong underline-offset-4 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Back to recipes
        </Link>

        <p className="mt-8 text-xs font-bold tracking-[0.18em] text-accent uppercase">
          {label}
        </p>
        <div className="mt-4 grid gap-8 lg:grid-cols-[minmax(0,1fr)_15rem] lg:items-end">
          <div>
            <h1 className="max-w-3xl font-display text-5xl leading-[0.92] tracking-[-0.05em] text-foreground sm:text-7xl">
              {recipe.title}
            </h1>
            {recipe.description ? (
              <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
                {recipe.description}
              </p>
            ) : null}
          </div>

          <div className="border-l-2 border-accent pl-5">
            <dl className="grid grid-cols-2 gap-x-5 gap-y-4 text-sm">
              <div>
                <dt className="text-muted-foreground">Serves</dt>
                <dd className="mt-1 font-semibold text-foreground">
                  {recipe.servings ?? "Flexible"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Total</dt>
                <dd className="mt-1 font-semibold text-foreground">
                  {totalMinutes > 0 ? `${totalMinutes} min` : "Flexible"}
                </dd>
              </div>
            </dl>
            {action ? <div className="mt-5">{action}</div> : null}
          </div>
        </div>
      </div>

      <div className="grid gap-12 py-10 sm:py-14 lg:grid-cols-[minmax(16rem,0.72fr)_minmax(0,1.28fr)] lg:gap-20">
        <section aria-labelledby="ingredients-heading">
          <p
            className="font-display text-6xl leading-none text-border"
            aria-hidden="true"
          >
            01
          </p>
          <h2
            id="ingredients-heading"
            className="-mt-5 font-display text-3xl tracking-[-0.03em] text-foreground"
          >
            Ingredients
          </h2>
          <ul className="mt-7 divide-y divide-border border-y border-border">
            {recipe.ingredients.map((ingredient) => (
              <li
                key={ingredient.id}
                className="py-4 leading-7 text-foreground"
              >
                {formatIngredient(ingredient)}
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="method-heading">
          <p
            className="font-display text-6xl leading-none text-border"
            aria-hidden="true"
          >
            02
          </p>
          <h2
            id="method-heading"
            className="-mt-5 font-display text-3xl tracking-[-0.03em] text-foreground"
          >
            Method
          </h2>
          <ol className="mt-7 space-y-8 border-t border-border pt-7">
            {recipe.steps.map((step, index) => (
              <li key={step.id} className="grid grid-cols-[2.25rem_1fr] gap-4">
                <span
                  className="font-display text-2xl text-accent"
                  aria-hidden="true"
                >
                  {index + 1}
                </span>
                <p className="text-base leading-8 text-foreground">
                  {step.text}
                </p>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </article>
  );
}

function formatIngredient(ingredient: RecipeContent["ingredients"][number]) {
  const amount = [ingredient.quantity, ingredient.unit]
    .filter(Boolean)
    .join(" ");
  const core = [amount, ingredient.name].filter(Boolean).join(" ");
  return ingredient.note ? `${core}, ${ingredient.note}` : core;
}
