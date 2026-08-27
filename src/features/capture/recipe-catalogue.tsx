import Link from "next/link";
import { CatalogueSaveStateProvider } from "@/features/capture/catalogue-save-state";
import { SaveCatalogueMealButton } from "@/features/capture/save-catalogue-meal-button";
import type { CatalogueMeal } from "@/lib/domain/recipes";
import { standardCatalogue } from "@/lib/domain/standard-catalogue";

export function RecipeCatalogue() {
  return (
    <section aria-labelledby="catalogue-heading" className="mt-20 sm:mt-24">
      <div className="grid gap-6 border-b border-foreground pb-7 sm:grid-cols-[1fr_1.2fr] sm:items-end">
        <div>
          <p className="text-xs font-bold tracking-[0.18em] text-accent uppercase">
            Foodedo catalogue
          </p>
          <h2
            id="catalogue-heading"
            className="mt-3 font-display text-4xl tracking-[-0.035em] text-foreground sm:text-5xl"
          >
            Reliable answers.
          </h2>
        </div>
        <p className="max-w-xl text-sm leading-7 text-muted-foreground sm:justify-self-end">
          Every catalogue recipe is available without an account. Save only the
          ones you want close at hand.
        </p>
      </div>

      <CatalogueSaveStateProvider catalogueVersion={standardCatalogue.version}>
        <ol>
          {standardCatalogue.meals.map((meal, index) => (
            <CatalogueRecipeRow key={meal.id} meal={meal} index={index} />
          ))}
        </ol>
      </CatalogueSaveStateProvider>
    </section>
  );
}

function CatalogueRecipeRow({
  meal,
  index,
}: {
  meal: CatalogueMeal;
  index: number;
}) {
  const totalMinutes = (meal.prepMinutes ?? 0) + (meal.cookMinutes ?? 0);

  return (
    <li className="grid gap-5 border-b border-border py-8 sm:grid-cols-[4rem_minmax(0,1fr)_auto] sm:items-center sm:gap-8 sm:py-9">
      <p
        className="font-display text-4xl leading-none text-border-strong"
        aria-hidden="true"
      >
        {String(index + 1).padStart(2, "0")}
      </p>

      <div>
        <Link
          href={`/recipes/${encodeURIComponent(meal.slug)}`}
          className="group inline-block focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
        >
          <h3 className="font-display text-3xl leading-tight tracking-[-0.03em] text-foreground decoration-border-strong underline-offset-4 group-hover:underline sm:text-[2.15rem]">
            {meal.title}
          </h3>
        </Link>
        {meal.description ? (
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            {meal.description}
          </p>
        ) : null}
        <p className="mt-3 text-xs font-bold tracking-[0.08em] text-accent uppercase">
          {meal.servings ? `Serves ${meal.servings}` : "Flexible servings"}
          {totalMinutes > 0 ? ` · ${totalMinutes} min` : ""}
        </p>
      </div>

      <div className="sm:justify-self-end">
        <SaveCatalogueMealButton catalogueMealId={meal.id} />
      </div>
    </li>
  );
}
