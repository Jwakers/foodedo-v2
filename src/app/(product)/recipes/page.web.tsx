import type { Metadata } from "next";
import { RecipesListing } from "@/features/recipes/recipes-listing";
import { getPublishedRecipes } from "@/features/public-recipes/catalogue.server";
import { siteUrl } from "@/lib/seo/site-url";

export const dynamic = "force-static";
export const revalidate = 1800;

export const metadata: Metadata = {
  title: "Recipes · Foodedo",
  description: "Browse Foodedo recipes and keep the ones you want to cook.",
  alternates: { canonical: siteUrl("/recipes") },
};

export default async function RecipesPage() {
  return <RecipesListing initialMeals={await getPublishedRecipes()} />;
}
