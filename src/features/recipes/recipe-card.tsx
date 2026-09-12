"use client";

import { Bookmark } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { temporaryFeedback } from "@/lib/ui/temporary-feedback";
import { cn } from "@/lib/utils/cn";

/**
 * Listing card: media + title + meta, with a separate 44px save target so
 * bookmark taps never navigate (Paper §08 behaviour).
 */
export function RecipeCard({
  title,
  meta,
  imageSrc,
  saved,
  canSave,
  href,
  onOpen,
}: {
  title: string;
  meta: string;
  imageSrc?: string | null;
  saved: boolean;
  /** False for guests — save asks them to sign in instead. */
  canSave: boolean;
  href?: string;
  onOpen?: () => void;
}) {
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
    </div>
  );

  const copy = (
    <div className="pt-2">
      <p className="font-display text-18 font-semibold tracking-card text-ink">
        {title}
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

      <button
        type="button"
        aria-label={saved ? `Unsave ${title}` : `Save ${title}`}
        aria-pressed={saved}
        className={cn(
          "absolute top-1.5 right-1.5 z-10 flex size-11 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cadmium",
          saved
            ? "bg-leaf-soft text-leaf"
            : "border border-paper bg-mist text-ink",
        )}
        onClick={() => {
          if (!canSave) {
            temporaryFeedback("Sign in to save recipes you love.");
            return;
          }
          temporaryFeedback(
            saved
              ? `Unsaving “${title}” comes next.`
              : `Saving “${title}” comes next.`,
          );
        }}
      >
        <Bookmark aria-hidden="true" className="size-4.5" strokeWidth={1.8} />
      </button>
    </div>
  );
}
