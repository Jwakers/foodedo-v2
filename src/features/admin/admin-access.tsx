"use client";
import type { ReactNode } from "react";
import { useConvexAuth, useQuery } from "convex/react";
import { SignInButton } from "@clerk/react";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { adminContainerClass } from "./admin-layout";

export function AdminAccess({
  children,
  title = "Recipe editorial",
}: {
  children: ReactNode;
  title?: string;
}) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const access = useQuery(
    api.catalogueAdmin.access,
    isAuthenticated ? {} : "skip",
  );
  if (isLoading || (isAuthenticated && access === undefined))
    return (
      <main className={`${adminContainerClass} py-8`}>
        <p role="status">Checking administrator access…</p>
      </main>
    );
  if (!isAuthenticated)
    return (
      <main className={`${adminContainerClass} space-y-5 py-8`}>
        <h1 className="font-display text-3xl">{title}</h1>
        <p>
          Sign in with an administrator account to review catalogue recipes.
        </p>
        <SignInButton mode="modal">
          <Button>Sign in</Button>
        </SignInButton>
      </main>
    );
  if (!access?.isAdmin)
    return (
      <main className={`${adminContainerClass} py-8`}>
        <h1 className="font-display text-3xl">Administrator access required</h1>
        <p className="mt-3">
          This account does not have access to recipe editorial.
        </p>
      </main>
    );
  return children;
}
