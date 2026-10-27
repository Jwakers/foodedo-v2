import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { RecipesListing } from "@/features/recipes/recipes-listing";
import { getPublishedRecipePage } from "@/features/public-recipes/catalogue.server";
import {
  parseRecipeBrowse,
  recipeBrowseHref,
  isPublicRecipeBrowse,
} from "@/lib/domain/recipe-browse";
import { siteUrl } from "@/lib/seo/site-url";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

async function locationFrom({ searchParams }: Props) {
  const params = await searchParams;
  if (
    params.page !== undefined &&
    (typeof params.page !== "string" ||
      !/^[1-9]\d*$/.test(params.page) ||
      !Number.isSafeInteger(Number(params.page)))
  )
    notFound();
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    for (const item of Array.isArray(value)
      ? value
      : value === undefined
        ? []
        : [value])
      query.append(key, item);
  }
  return `/recipes?${query}`;
}

const readPage = cache(async (location: string) => {
  const state = parseRecipeBrowse(location);
  // Personal collections remain client-authenticated and never enter the public cache.
  const initialPage =
    state.scope === "All"
      ? await getPublishedRecipePage(state)
      : { page: [], isDone: true, pageNumber: state.page, totalPages: 1 };
  if (!initialPage) notFound();
  return { state, initialPage, location: recipeBrowseHref(state) };
});

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { state, location } = await readPage(await locationFrom(props));
  return {
    title:
      state.page === 1
        ? "Recipes · Foodedo"
        : `Recipes · Page ${state.page} · Foodedo`,
    description: "Browse Foodedo recipes and keep the ones you want to cook.",
    alternates: {
      canonical: siteUrl(state.scope === "All" ? location : "/recipes"),
    },
    ...(!isPublicRecipeBrowse(state)
      ? { robots: { index: false, follow: true } }
      : {}),
  };
}

/** searchParams opts the web page into request-time rendering; catalogue data stays cached. */
export default async function RecipesPage(props: Props) {
  const { initialPage, location } = await readPage(await locationFrom(props));
  return (
    <RecipesListing
      initialPage={initialPage}
      webPagination={{ ...initialPage, location }}
    />
  );
}
