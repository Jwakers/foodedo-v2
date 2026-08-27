import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CatalogueSaveStateProvider } from "@/features/capture/catalogue-save-state";
import { SaveCatalogueMealButton } from "@/features/capture/save-catalogue-meal-button";
import { RecipeArticle } from "@/features/cook/recipe-article";
import {
  findStandardCatalogueMealBySlug,
  standardCatalogue,
} from "@/lib/domain/standard-catalogue";

type RecipePageProps = {
  params: Promise<{ slug: string }>;
};

export const dynamicParams = false;

export function generateStaticParams() {
  return standardCatalogue.meals.map((meal) => ({ slug: meal.slug }));
}

export async function generateMetadata({
  params,
}: RecipePageProps): Promise<Metadata> {
  const { slug } = await params;
  const recipe = findStandardCatalogueMealBySlug(slug);

  if (recipe === null) {
    return { title: "Recipe unavailable · Foodedo" };
  }

  return {
    title: `${recipe.title} · Foodedo`,
    description:
      recipe.description ?? `Ingredients and method for ${recipe.title}.`,
  };
}

export default async function RecipePage({ params }: RecipePageProps) {
  const { slug } = await params;
  const recipe = findStandardCatalogueMealBySlug(slug);

  if (recipe === null) notFound();

  return (
    <main className="mx-auto w-full max-w-6xl px-5 pb-28 pt-5 sm:px-8 sm:pb-20 sm:pt-8 lg:px-12">
      <CatalogueSaveStateProvider catalogueVersion={standardCatalogue.version}>
        <RecipeArticle
          recipe={recipe}
          label="Foodedo catalogue"
          action={<SaveCatalogueMealButton catalogueMealId={recipe.id} />}
        />
      </CatalogueSaveStateProvider>
    </main>
  );
}
