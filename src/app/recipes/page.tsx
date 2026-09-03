import type { Metadata } from "next";
import { PagePlaceholder } from "@/components/page-placeholder";

export const metadata: Metadata = {
  title: "Recipes · Foodedo",
  description: "Browse Foodedo recipes and keep the ones you want to cook.",
};

export default function RecipesPage() {
  return <PagePlaceholder eyebrow="Route placeholder" title="Recipes" />;
}
