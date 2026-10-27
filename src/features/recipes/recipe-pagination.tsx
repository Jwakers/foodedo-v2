"use client";

import Link from "next/link";
import { buttonClassName } from "@/components/ui/button";

export function RecipePagination({
  page,
  totalPages,
  hasNext,
  href,
  onNavigate,
}: {
  page: number;
  totalPages?: number;
  hasNext: boolean;
  href: (page: number) => string;
  onNavigate?: (page: number) => void;
}) {
  const last = totalPages ?? page + (hasNext ? 1 : 0);
  if (last <= 1) return null;
  const numbers = [
    ...new Set([
      1,
      page - 1,
      page,
      page + 1,
      ...(totalPages ? [totalPages] : []),
    ]),
  ]
    .filter((number) => number >= 1 && number <= last)
    .sort((a, b) => a - b);
  const classes = buttonClassName({
    variant: "secondary",
    className: "h-11 min-w-11 px-3",
  });
  function link(number: number, label: string) {
    return (
      <Link
        href={href(number)}
        prefetch={false}
        className={classes}
        onClick={
          onNavigate
            ? (event) => {
                if (
                  !event.metaKey &&
                  !event.ctrlKey &&
                  !event.shiftKey &&
                  !event.altKey &&
                  event.button === 0
                ) {
                  event.preventDefault();
                  onNavigate(number);
                }
              }
            : undefined
        }
      >
        {label}
      </Link>
    );
  }
  return (
    <nav
      aria-label="Recipe pages"
      className="mt-7 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2"
    >
      {page > 1 ? (
        link(page - 1, "Previous")
      ) : (
        <span
          aria-disabled="true"
          className={`${classes} text-graphite opacity-50`}
        >
          Previous
        </span>
      )}
      <div className="min-w-0 text-center">
        <span className="text-14 text-graphite sm:hidden">
          Page {page}
          {totalPages ? ` of ${totalPages}` : ""}
        </span>
        <div className="hidden items-center justify-center gap-2 sm:flex">
          {numbers.map((number, index) => (
            <span key={number} className="inline-flex items-center gap-2">
              {index > 0 && number - numbers[index - 1] > 1 ? (
                <span aria-hidden="true">…</span>
              ) : null}
              {number === page ? (
                <span
                  aria-current="page"
                  aria-label={`Page ${number}`}
                  className={buttonClassName({
                    variant: "primary",
                    className: "h-11 min-w-11 px-3",
                  })}
                >
                  {number}
                </span>
              ) : (
                link(number, String(number))
              )}
            </span>
          ))}
        </div>
      </div>
      {hasNext ? (
        link(page + 1, "Next")
      ) : (
        <span
          aria-disabled="true"
          className={`${classes} text-graphite opacity-50`}
        >
          Next
        </span>
      )}
    </nav>
  );
}
