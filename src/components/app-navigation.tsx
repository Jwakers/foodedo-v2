"use client";

import {
  BookOpen,
  CalendarDays,
  Home,
  ShoppingBasket,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils/cn";

const navigationItems = [
  { href: "/", label: "Home", section: "home", icon: Home },
  { href: "/week", label: "Week", section: "week", icon: CalendarDays },
  {
    href: "/shop",
    label: "Shopping",
    section: "shopping",
    icon: ShoppingBasket,
  },
  { href: "/recipes", label: "Recipes", section: "recipes", icon: BookOpen },
] as const;

type NavigationSection = (typeof navigationItems)[number]["section"];

export function AppNavigation({ placement }: { placement: "header" | "dock" }) {
  const pathname = usePathname();

  if (placement === "header") {
    return (
      <nav aria-label="Primary" className="hidden items-center gap-6 sm:flex">
        {navigationItems.map((item) => {
          const isCurrent = isCurrentSection(pathname, item.section);

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isCurrent ? "page" : undefined}
              className={cn(
                "border-b-2 py-2 text-14 font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cadmium",
                isCurrent
                  ? "border-cadmium text-cadmium"
                  : "border-transparent text-graphite hover:text-ink",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-control-muted bg-background pb-[env(safe-area-inset-bottom)] sm:hidden"
    >
      <div className="mx-auto grid max-w-md grid-cols-4 px-2">
        {navigationItems.map((item) => {
          const isCurrent = isCurrentSection(pathname, item.section);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isCurrent ? "page" : undefined}
              className={cn(
                "flex min-h-16 flex-col items-center justify-center gap-1 text-11 font-bold transition-colors focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-cadmium",
                isCurrent ? "text-cadmium" : "text-graphite",
              )}
            >
              <Icon aria-hidden="true" className="size-5" />
              {item.label}
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
