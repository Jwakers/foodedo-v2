"use client";

import {
  Book,
  CalendarDays,
  Home,
  ShoppingBag,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils/cn";

type NavigationSection = "home" | "week" | "shopping" | "recipes";

const navigationItems: ReadonlyArray<{
  href: string;
  label: string;
  section: NavigationSection;
  icon: LucideIcon;
}> = [
  { href: "/", label: "Home", section: "home", icon: Home },
  { href: "/week", label: "Week", section: "week", icon: CalendarDays },
  { href: "/shop", label: "Shopping", section: "shopping", icon: ShoppingBag },
  { href: "/recipes", label: "Recipes", section: "recipes", icon: Book },
];

export function AppNavigation() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-paper"
    >
      <div className="mx-auto flex h-(--app-nav-height) w-full max-w-175 justify-between px-4.5 pt-2.5 pb-(--app-nav-pad-bottom)">
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
              <Icon aria-hidden="true" className="size-5.5" strokeWidth={2} />
              <span className="text-11 leading-3.5">{item.label}</span>
            </Link>
          );
        })}
      </div>
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
