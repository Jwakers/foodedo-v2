import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getPublicRecipe,
  getPublishedRecipes,
} from "@/features/public-recipes/catalogue.server";
import { recipeMetadata } from "@/features/public-recipes/metadata";
import { PublicRecipeDetail } from "@/features/recipes/public-recipe-detail";
import { publicRecipePath } from "@/lib/routing/recipes";
import { siteUrl } from "@/lib/seo/site-url";

export const dynamic = "force-static";
export const dynamicParams = true;
export const revalidate = 86400;

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return (await getPublishedRecipes()).map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const recipe = await getPublicRecipe((await params).slug);
  if (!recipe) notFound();
  return recipeMetadata(recipe);
}

export default async function PublicRecipePage({ params }: Props) {
  const recipe = await getPublicRecipe((await params).slug);
  if (!recipe) notFound();
  return (
    <main className="mx-auto w-full max-w-175 pb-10">
      <PublicRecipeDetail
        initialRecipe={recipe}
        canonicalUrl={siteUrl(publicRecipePath(recipe.slug))}
      />
    </main>
  );
}
