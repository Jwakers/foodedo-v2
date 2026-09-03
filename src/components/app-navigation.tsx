"use client";

import type { SVGProps } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils/cn";

const navigationItems = [
  { href: "/", label: "Home", section: "home", icon: HomeIcon },
  { href: "/week", label: "Week", section: "week", icon: WeekIcon },
  { href: "/shop", label: "Shopping", section: "shopping", icon: ShoppingIcon },
  { href: "/recipes", label: "Recipes", section: "recipes", icon: RecipesIcon },
] as const;

type NavigationSection = (typeof navigationItems)[number]["section"];

export function AppNavigation() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-paper"
    >
      <div className="mx-auto flex h-19.5 w-full max-w-175 justify-between px-4.5 pt-2.5 pb-4">
        {navigationItems.map((item) => {
          const isCurrent = isCurrentSection(pathname, item.section);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isCurrent ? "page" : undefined}
              className={cn(
                "flex w-18 shrink-0 flex-col items-center gap-1 transition-colors",
                "focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-cadmium",
                isCurrent
                  ? "font-bold text-cadmium"
                  : "font-semibold text-graphite",
              )}
            >
              <Icon aria-hidden="true" />
              <span className="text-11 leading-3.5">{item.label}</span>
            </Link>
          );
        })}
      </div>
      <div className="h-[env(safe-area-inset-bottom)]" />
    </nav>
  );
}

function isCurrentSection(pathname: string, section: NavigationSection) {
  if (section === "home") {
    return pathname === "/";
  }

  if (section === "week") {
    return pathname === "/week" || pathname.startsWith("/week/");
  }

  if (section === "shopping") {
    return pathname === "/shop" || pathname.startsWith("/shop/");
  }

  return pathname === "/recipes" || pathname.startsWith("/recipes/");
}

function HomeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" {...props}>
      <path
        d="m3 11 9-8 9 8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5 10v10h14V10"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9 20v-6h6v6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function WeekIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" {...props}>
      <g
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M8 2v4" />
        <path d="M16 2v4" />
        <rect width="18" height="18" x="3" y="4" rx="2" />
        <path d="M3 10h18" />
        <path d="M8 14h.01" />
        <path d="M12 14h.01" />
        <path d="M16 14h.01" />
      </g>
    </svg>
  );
}

function ShoppingIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" {...props}>
      <g
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m5 11 4-7" />
        <path d="m19 11-4-7" />
        <path d="M2 11h20" />
        <path d="M3.5 11 5 21h14l1.5-10" />
        <path d="M9 15v2" />
        <path d="M15 15v2" />
      </g>
    </svg>
  );
}

function RecipesIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" {...props}>
      <g
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
      </g>
    </svg>
  );
}
