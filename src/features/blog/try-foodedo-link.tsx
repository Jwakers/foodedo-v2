"use client";

import Link from "next/link";
import { track, safePath } from "@/lib/analytics";
import type { ComponentProps } from "react";
import { enterGuestExperience } from "@/components/use-welcome-session";

/** The query also carries guest intent when opened in a new tab or without JS. */
export function TryFoodedoLink({
  href = "/?try=1",
  ctaLocation = "article_body",
  ...props
}: Omit<ComponentProps<typeof Link>, "href"> & {
  href?: string;
  ctaLocation?: string;
}) {
  return (
    <Link
      {...props}
      href={href}
      prefetch={false}
      onClick={(event) => {
        props.onClick?.(event);
        if (!event.defaultPrevented)
          track("try_foodedo_clicked", {
            source_path: safePath(window.location.pathname),
            cta_location:
              ctaLocation === "article_footer" &&
              !window.location.pathname.startsWith("/blog/")
                ? "landing_footer"
                : ctaLocation,
          });
        if (
          !event.defaultPrevented &&
          event.button === 0 &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.shiftKey &&
          !event.altKey
        )
          enterGuestExperience();
      }}
    />
  );
}
