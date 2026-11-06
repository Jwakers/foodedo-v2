"use client";

import { useAllergies } from "@/features/allergies/allergy-context";
import { allergyWarningText } from "@/features/allergies/allergy-warning";
import type { AllergyEvidence } from "@/lib/domain/allergies";
import { TriangleAlert } from "lucide-react";
import { formatRecipeHeading } from "@/lib/domain/recipe-headings";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import { RecipeSaveButton } from "@/features/recipes/recipe-save-button";

/**
 * Listing card: media + title + meta, with a separate 44px save target so
 * heart taps never navigate (Paper §08 behaviour).
 */
export function RecipeCard({
  title,
  allergyEvidence = {},
  meta,
  imageSrc,
  saved,
  isSaveDisabled = false,
  onToggleSave,
  href,
  onOpen,
  showSave = true,
}: {
  title: string;
  allergyEvidence?: Partial<AllergyEvidence>;
  meta: ReactNode;
  imageSrc?: string | null;
  saved: boolean;
  isSaveDisabled?: boolean;
  onToggleSave: () => Promise<unknown> | void;
  href?: string;
  onOpen?: () => void;
  showSave?: boolean;
}) {
  const { effectiveIds } = useAllergies();
  const allergyLabel = allergyWarningText(allergyEvidence, effectiveIds);
  const media = (
    <div className="relative aspect-167/116 w-full overflow-hidden rounded-surface bg-mist">
      {imageSrc ? (
        <Image
          src={imageSrc}
          alt=""
          fill
          sizes="(max-width: 640px) 50vw, 200px"
          className="object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center px-3 text-center">
          <span className="text-12 font-medium text-graphite">
            No photo yet
          </span>
        </div>
      )}
      {allergyLabel ? (
        <span className="absolute bottom-2 left-2 right-2 flex w-fit max-w-[calc(100%-16px)] items-start gap-1 rounded-md bg-cadmium-soft px-2 py-1 text-12 font-semibold text-cadmium">
          <TriangleAlert
            aria-hidden="true"
            className="mt-0.5 size-3 shrink-0"
          />
          {allergyLabel}
        </span>
      ) : null}
    </div>
  );

  const copy = (
    <div className="pt-2">
      <p className="font-display text-18 font-semibold tracking-card text-ink">
        {formatRecipeHeading(title)}
      </p>
      {meta ? (
        <p className="mt-0.5 text-13 leading-4.5 text-graphite">{meta}</p>
      ) : null}
    </div>
  );

  return (
    <div className="relative flex flex-col">
      {href ? (
        <Link
          href={href}
          className="flex flex-col focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cadmium"
        >
          {media}
          {copy}
        </Link>
      ) : (
        <button
          type="button"
          className="flex w-full flex-col text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cadmium"
          onClick={onOpen}
        >
          {media}
          {copy}
        </button>
      )}

      {showSave ? (
        <RecipeSaveButton
          title={title}
          saved={saved}
          isSaveDisabled={isSaveDisabled}
          onToggleSave={onToggleSave}
        />
      ) : null}
    </div>
  );
}
