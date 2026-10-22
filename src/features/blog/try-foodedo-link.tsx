"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { enterGuestExperience } from "@/components/use-welcome-session";

/** The query also carries guest intent when opened in a new tab or without JS. */
export function TryFoodedoLink({
  href = "/?try=1",
  ...props
}: Omit<ComponentProps<typeof Link>, "href"> & { href?: string }) {
  return (
    <Link
      {...props}
      href={href}
      prefetch={false}
      onClick={(event) => {
        props.onClick?.(event);
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
