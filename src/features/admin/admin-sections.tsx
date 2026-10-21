import Link from "next/link";

export function AdminSections({
  active,
}: {
  active: "proposals" | "catalogue";
}) {
  return (
    <nav
      aria-label="Editorial sections"
      className="mb-6 flex flex-wrap gap-5 border-b border-border"
    >
      {(
        [
          {
            key: "proposals",
            label: "Recipe proposals",
            href: "/admin/recipes",
          },
          {
            key: "catalogue",
            label: "Catalogue maintenance",
            href: "/admin/catalogue",
          },
        ] as const
      ).map((section) => (
        <Link
          key={section.key}
          href={section.href}
          aria-current={active === section.key ? "page" : undefined}
          className="inline-flex min-h-11 items-center border-b-2 border-transparent text-sm font-semibold text-graphite aria-[current=page]:border-cadmium aria-[current=page]:text-ink"
        >
          {section.label}
        </Link>
      ))}
    </nav>
  );
}
