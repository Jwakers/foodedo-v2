import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PagePlaceholder } from "@/components/page-placeholder";
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

  return <PagePlaceholder eyebrow="Recipe placeholder" title={recipe.title} />;
}
