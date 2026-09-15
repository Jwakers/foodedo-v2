"use client";

import { Heart } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { cn } from "@/lib/utils/cn";

/**
 * Listing card: media + title + meta, with a separate 44px save target so
 * heart taps never navigate (Paper §08 behaviour).
 */
export function RecipeCard({
  title,
  meta,
  imageSrc,
  saved,
  isSavePending = false,
  onToggleSave,
  href,
  onOpen,
}: {
  title: string;
  meta: string;
  imageSrc?: string | null;
  saved: boolean;
  isSavePending?: boolean;
  onToggleSave: () => Promise<unknown> | void;
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
        aria-busy={isSavePending || undefined}
        disabled={isSavePending}
        className={cn(
          "absolute top-1.5 right-1.5 z-10 flex size-11 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cadmium disabled:cursor-wait disabled:opacity-70",
          saved
            ? "bg-cadmium-soft text-cadmium"
            : "border border-paper bg-mist text-ink",
        )}
        onClick={() => {
          void onToggleSave();
        }}
      >
        <Heart
          aria-hidden="true"
          className={cn("size-4.5", saved && "fill-current")}
          strokeWidth={1.8}
        />
      </button>
    </div>
  );
}
