import type { Metadata } from "next";

import { RecipesListing } from "@/features/recipes/recipes-listing";

export const metadata: Metadata = {
  title: "Recipes · Foodedo",
  description: "Browse Foodedo recipes and keep the ones you want to cook.",
};

export default function RecipesPage() {
  return <RecipesListing />;
}
