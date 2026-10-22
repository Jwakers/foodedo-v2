import type { Metadata } from "next";
import type { CatalogueMeal } from "@/lib/domain/recipes";
import {
  formatIngredientAmount,
  formatIngredientNote,
} from "@/lib/domain/recipe-display";
import { siteUrl } from "@/lib/seo/site-url";
import { publicRecipePath } from "@/lib/routing/recipes";

export function recipeDescription(recipe: CatalogueMeal) {
  return (
    recipe.description?.trim() ||
    `Ingredients and step-by-step instructions for ${recipe.title}.`
  );
}

export function recipeMetadata(recipe: CatalogueMeal): Metadata {
  const title = `${recipe.title} | Foodedo`;
  const description = recipeDescription(recipe);
  const url = siteUrl(publicRecipePath(recipe.slug));
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: "Foodedo",
      locale: "en_GB",
      type: "article",
      images: recipe.imageSrc
        ? [{ url: new URL(recipe.imageSrc, url).toString(), alt: recipe.title }]
        : undefined,
    },
    twitter: {
      card: recipe.imageSrc ? "summary_large_image" : "summary",
      title,
      description,
      images: recipe.imageSrc
        ? [new URL(recipe.imageSrc, url).toString()]
        : undefined,
    },
  };
}

function duration(minutes: number | undefined) {
  return minutes === undefined ? undefined : `PT${minutes}M`;
}

export function recipeStructuredData(
  recipe: CatalogueMeal,
  canonicalUrl = siteUrl(publicRecipePath(recipe.slug)),
) {
  const hasCompleteTiming =
    recipe.prepMinutes !== undefined && recipe.cookMinutes !== undefined;
  return {
    "@context": "https://schema.org",
    "@type": "Recipe",
    name: recipe.title,
    identifier: recipe.id,
    version: recipe.version,
    description: recipeDescription(recipe),
    url: canonicalUrl,
    image: recipe.imageSrc
      ? new URL(recipe.imageSrc, canonicalUrl).toString()
      : undefined,
    recipeYield:
      recipe.servings === undefined ? undefined : String(recipe.servings),
    // Google expects prepTime/cookTime together. Keep partial authored timing
    // visible in the UI, but never invent the missing duration for markup.
    prepTime: hasCompleteTiming ? duration(recipe.prepMinutes) : undefined,
    cookTime: hasCompleteTiming ? duration(recipe.cookMinutes) : undefined,
    totalTime:
      recipe.prepMinutes !== undefined && recipe.cookMinutes !== undefined
        ? duration(recipe.prepMinutes + recipe.cookMinutes)
        : undefined,
    recipeIngredient: recipe.ingredients.map((ingredient) => {
      const amount = formatIngredientAmount(ingredient);
      const note = formatIngredientNote(ingredient);
      return [
        amount === "—" ? undefined : amount,
        ingredient.name,
        note ? `(${note})` : undefined,
      ]
        .filter(Boolean)
        .join(" ");
    }),
    recipeInstructions: recipe.steps.map((step) => ({
      "@type": "HowToStep",
      text: step.text,
    })),
  };
}
