import { notFound } from "next/navigation";
import { Suspense } from "react";

import { CookModePage } from "@/features/cook/cook-mode-page";
import {
  findStandardCatalogueMealBySlug,
  standardCatalogue,
} from "@/lib/domain/standard-catalogue";

export const dynamicParams = false;

export function generateStaticParams() {
  return standardCatalogue.meals.map((meal) => ({ slug: meal.slug }));
}

export default async function CookPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const meal = findStandardCatalogueMealBySlug(slug);
  if (meal === null) notFound();
  return (
    <Suspense
      fallback={
        <main className="min-h-dvh bg-paper" aria-label="Loading cook mode" />
      }
    >
      <CookModePage meal={meal} catalogueVersion={standardCatalogue.version} />
    </Suspense>
  );
}
