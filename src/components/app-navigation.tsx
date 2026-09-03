"use client";

import { BookOpen, CalendarDays, ShoppingBasket } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils/cn";

const navigationItems = [
  { href: "/", label: "Plan", section: "plan" },
  { href: "/recipes", label: "Recipes", section: "recipes" },
  { href: "/shop", label: "Shop", section: "shop" },
] as const;

export function AppNavigation({ placement }: { placement: "header" | "dock" }) {
  const pathname = usePathname();

  if (placement === "header") {
    return (
      <nav aria-label="Primary" className="hidden items-center gap-7 sm:flex">
        {navigationItems.map((item) => {
          const isCurrent = isCurrentSection(pathname, item.section);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isCurrent ? "page" : undefined}
              className={cn(
                "border-b py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent",
                isCurrent
                  ? "border-accent text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
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
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background pb-[env(safe-area-inset-bottom)] sm:hidden"
    >
      <div className="mx-auto grid max-w-sm grid-cols-3 px-3">
        {navigationItems.map((item) => {
          const isCurrent = isCurrentSection(pathname, item.section);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isCurrent ? "page" : undefined}
              className={cn(
                "flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-accent",
                isCurrent ? "text-accent" : "text-muted-foreground",
              )}
            >
              <NavigationMark section={item.section} />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function isCurrentSection(
  pathname: string,
  section: "plan" | "recipes" | "shop",
) {
  if (section === "plan") return pathname === "/";
  return pathname.startsWith(`/${section}`);
}

function NavigationMark({ section }: { section: "plan" | "recipes" | "shop" }) {
  if (section === "plan") {
    return <CalendarDays aria-hidden="true" className="size-5" />;
  }

  if (section === "recipes") {
    return <BookOpen aria-hidden="true" className="size-5" />;
  }

  return <ShoppingBasket aria-hidden="true" className="size-5" />;
}
