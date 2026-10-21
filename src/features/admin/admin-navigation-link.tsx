"use client";
import Link from "next/link";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
export function AdminNavigationLink() {
  const { isAuthenticated } = useConvexAuth();
  const access = useQuery(
    api.catalogueAdmin.access,
    isAuthenticated ? {} : "skip",
  );
  return access?.isAdmin ? (
    <Link
      className="mr-3 inline-flex min-h-11 items-center text-sm font-semibold text-cadmium focus-visible:outline-2 focus-visible:outline-cadmium"
      href="/admin/recipes"
    >
      Editorial
    </Link>
  ) : null;
}
