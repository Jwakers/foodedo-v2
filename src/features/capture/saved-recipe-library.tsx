"use client";

import { SignInButton } from "@clerk/react";
import { useConvexAuth, usePaginatedQuery } from "convex/react";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { api } from "../../../convex/_generated/api";
import { findStandardCatalogueMeal } from "@/lib/domain/standard-catalogue";

export function SavedRecipeLibrary() {
  const { isAuthenticated, isLoading: isAuthLoading } = useConvexAuth();
  const { results, status, loadMore } = usePaginatedQuery(
    api.recipes.listMine,
    isAuthenticated ? {} : "skip",
    { initialNumItems: 12 },
  );

  if (isAuthLoading) {
    return <LibraryNotice>Opening your recipe book…</LibraryNotice>;
  }

  if (!isAuthenticated) {
    return (
      <div className="border-l-2 border-accent py-1 pl-5">
        <p className="max-w-lg text-sm leading-6 text-muted-foreground">
          Browse freely. Sign in when you want recipes kept here and synced to
          every device.
        </p>
        <SignInButton mode="modal">
          <button
            type="button"
            className="mt-3 inline-flex min-h-11 items-center text-sm font-bold text-accent underline decoration-border-strong underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Sign in to see My recipes
          </button>
        </SignInButton>
      </div>
    );
  }

  if (status === "LoadingFirstPage") {
    return <LibraryNotice>Opening your recipe book…</LibraryNotice>;
  }

  if (results.length === 0) {
    return (
      <div className="border-y border-border py-8">
        <p className="font-display text-2xl text-foreground">
          Your recipe book has room in it.
        </p>
        <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
          Save a catalogue recipe and it will appear here. Meals merely included
          in a plan stay out until you choose to keep them.
        </p>
      </div>
    );
  }

  return (
    <div>
      <ol className="grid gap-px border border-border bg-border sm:grid-cols-2">
        {results.map((recipe, index) => {
          const catalogueMeal =
            recipe.source.type === "catalogue"
              ? findStandardCatalogueMeal(
                  recipe.source.catalogueMealId,
                  recipe.source.catalogueVersion,
                )
              : null;

          return (
            <li key={recipe._id} className="bg-surface-raised p-6 sm:p-7">
              <p className="text-xs font-bold tracking-[0.14em] text-accent uppercase">
                Recipe {String(index + 1).padStart(2, "0")}
              </p>
              {catalogueMeal !== null ? (
                <Link
                  href={`/recipes/${encodeURIComponent(catalogueMeal.slug)}`}
                  className="group mt-4 block focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
                >
                  <RecipeLibraryTitle title={recipe.title} />
                  <p className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground group-hover:text-foreground">
                    Open recipe
                    <ArrowRight aria-hidden="true" className="size-4" />
                  </p>
                </Link>
              ) : (
                <div className="mt-4">
                  <RecipeLibraryTitle title={recipe.title} />
                  <p className="mt-7 text-sm text-muted-foreground">
                    This saved recipe is not available in the current catalogue.
                  </p>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {status === "CanLoadMore" ? (
        <button
          type="button"
          className="mt-6 inline-flex min-h-11 items-center text-sm font-bold text-accent underline decoration-border-strong underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          onClick={() => loadMore(12)}
        >
          Load more recipes
        </button>
      ) : null}
      {status === "LoadingMore" ? (
        <p className="mt-6 text-sm text-muted-foreground" aria-live="polite">
          Loading more…
        </p>
      ) : null}
    </div>
  );
}

function RecipeLibraryTitle({ title }: { title: string }) {
  return (
    <h3 className="font-display text-3xl leading-[1.05] tracking-[-0.035em] text-foreground decoration-border-strong underline-offset-4 group-hover:underline">
      {title}
    </h3>
  );
}

function LibraryNotice({ children }: { children: string }) {
  return (
    <p
      className="border-y border-border py-8 text-sm text-muted-foreground"
      aria-live="polite"
    >
      {children}
    </p>
  );
}
