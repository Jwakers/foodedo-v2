"use client";
import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useFoodedoAuth } from "@/features/auth/use-foodedo-auth";
const key = "foodedo:pending-household-invite";
export function rememberInvite(token: string) {
  try {
    localStorage.setItem(key, token);
  } catch {
    /* URL remains the fallback. */
  }
}
export function pendingInvite() {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
export function forgetInvite() {
  try {
    localStorage.removeItem(key);
  } catch {}
}
export function InviteContinuation() {
  const { isAuthenticated } = useFoodedoAuth();
  const pathname = usePathname();
  const router = useRouter();
  const resuming = useRef<string | null>(null);
  useEffect(() => {
    const token = pendingInvite();
    if (!token || !isAuthenticated) resuming.current = null;
    if (
      isAuthenticated &&
      token &&
      resuming.current !== token &&
      !pathname.startsWith("/household")
    ) {
      // Resume once. The join page consumes the continuation on arrival; keep
      // it until then so a pending guest-plan claim cannot race this navigation.
      resuming.current = token;
      router.replace(`/household/join?token=${encodeURIComponent(token)}`);
    }
  }, [isAuthenticated, pathname, router]);
  return null;
}
