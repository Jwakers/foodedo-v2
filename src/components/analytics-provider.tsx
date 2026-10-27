"use client";

import { Suspense, useEffect, useRef, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { attribution, safePath, track, type PageType } from "@/lib/analytics";

function pageType(path: string, guidePaths: string[]): PageType {
  if (path === "/") return "home";
  if (path === "/recipes") return "recipes_index";
  if (
    /^\/recipes\/[^/]+$/.test(path) &&
    ![
      "/recipes/view",
      "/recipes/cook",
      "/recipes/import",
      "/recipes/edit",
      "/recipes/saved",
    ].includes(path)
  )
    return "recipe";
  if (path.startsWith("/blog/"))
    return guidePaths.includes(path) ? "guide" : "article";
  if (
    [
      "/recipe-to-shopping-list",
      "/family-meal-planning",
      "/household-meal-planning",
    ].includes(path)
  )
    return "landing";
  if (guidePaths.includes(path)) return "guide";
  if (/^\/(week|shop|home|recipes|settings|household)(\/|$)/.test(path))
    return "app";
  return "other";
}

export function AnalyticsProvider({
  children,
  guidePaths,
}: {
  children: ReactNode;
  guidePaths: string[];
}) {
  return (
    <>
      {children}
      <Suspense fallback={null}>
        <RouteAnalytics guidePaths={guidePaths} />
      </Suspense>
    </>
  );
}

function RouteAnalytics({ guidePaths }: { guidePaths: string[] }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const route = `${pathname}?${params.toString()}`;
  const previous = useRef<string | null>(null);
  const previousPath = useRef<string | null>(null);
  useEffect(() => {
    if (previous.current === route) return;
    previous.current = route;
    const path = safePath(pathname);
    const type = pageType(path, guidePaths);
    track("$pageview", { path, page_type: type });
    if (type === "recipe") {
      let referrerPath = previousPath.current;
      if (!referrerPath) {
        try {
          const referrer = new URL(document.referrer);
          if (referrer.origin === window.location.origin)
            referrerPath = referrer.pathname;
        } catch {
          /* direct */
        }
      }
      track("recipe_viewed", {
        recipe_slug: path.slice("/recipes/".length),
        referrer_type: referrerPath?.startsWith("/blog/")
          ? "article"
          : referrerPath === "/recipes"
            ? "recipes_index"
            : previousPath.current === null &&
                attribution(`${window.location.origin}/`, document.referrer)
                  .is_organic_search
              ? "search"
              : "other",
      });
    }
    previousPath.current = path;
  }, [pathname, route, guidePaths]);
  return null;
}
